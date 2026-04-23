import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import type { NodeDefinition, ExecutionContext, ClaudeCodeConfig } from '../types.js';
import type { NodeExecutor } from '../core/Executor.js';
import { Worker } from 'worker_threads';

var CLAUDE_EXPORT_WORKER: Worker | null = null;

export class ClaudeCodeNode implements NodeExecutor {
  async execute(
    node: NodeDefinition,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.config as ClaudeCodeConfig;
    const startTime = Date.now();

    // Prepare working directory
    const workDir = await this.prepareWorkDir(context);

    // Render and write context markdown
    const contextMdPath = path.join(workDir, `${node.id}.md`);
    await this.renderContextMarkdown(config, inputs, contextMdPath, context);

    // Read the context markdown and use it directly as the prompt to avoid shell expansion issues
    const contextContent = readFileSync(contextMdPath, 'utf-8');

    // Execute Claude
    let output: any = await this.executeAndValidate(contextContent, workDir, config, context, node, startTime);

    return output;
  }

  private registerSessionToWorker(workDir: string, node: NodeDefinition, claudeCodeSessionId: string, context: ExecutionContext) {
    if (CLAUDE_EXPORT_WORKER === null) {
      CLAUDE_EXPORT_WORKER = new Worker(path.join(__dirname, '../tools/ClaudeExporterWorker.js'), {
        workerData: {
          workdir: workDir,
          cleanOldFiles: context.cleanOldFiles,
        },
      });
    }

    CLAUDE_EXPORT_WORKER.postMessage({
      type: 'add',
      nodeId: node.id,
      sessionId: claudeCodeSessionId,
      workdir: workDir,
    });
  }

  private async executeAndValidate(contextContent: string, workDir: string, config: ClaudeCodeConfig, context: ExecutionContext, node: NodeDefinition, startTime: number) {
    const claudeCodeSessionId = uuidv4();
    const { resume } = config
    let validator = null;

    // Register the current task with ClaudeExporterWorker so execution state can be exported periodically
    this.registerSessionToWorker(workDir, node, claudeCodeSessionId, context);

    for (let attempt = 1; attempt <= (config.resume?.maxAttempts || 0) + 1; attempt++) {
      let content = contextContent;

      if (resume && attempt > 1) {
        content = resume.prompt || `Verify failed. Please try again.`
      }
      // 构建 claude 命令（使用节点的 output schema 作为 JSON Schema 约束）
      const args = this.buildClaudeArgs(config, content, node.output.schema);

      if (config.resume && attempt > 1) {
        // On retry, pass sessionId with -r so audit logs and context stay associated
        args.push('-r', claudeCodeSessionId);
      } else {
        // On the first execution, pass sessionId so audit logs can be correlated
        args.push('--session-id', claudeCodeSessionId); // Pass sessionId for audit correlation
      }

      const result = await execa('claude', args, {
        cwd: workDir,
        timeout: config.timeout ?? 300000,
        all: true,
        reject: false,
        buffer: true,
        stdin: 'ignore', // Ignore stdin to avoid warnings
        env: {
          WORKFLOW_HOME: context.workflowDir,
          WORKSPACE_DIR: path.join(context.outputDir, context.sessionId),
          CLAUDE_PLUGIN_ROOT: context.workflowDir,
        }
      });

      // Read output. With --output-format json, stdout is already JSON.
      let output: any;
      try {
        // First try parsing stdout directly
        const rawOutput = JSON.parse(result.stdout);

        // If structured_output exists, use it as the real output and strip metadata
        if (rawOutput.structured_output) {
          output = rawOutput.structured_output;
        } else {
          output = rawOutput;
        }
      } catch (e) {
        throw new Error(
          `Node ${node.id}: could not parse output as JSON. stdout: ${result.stdout.slice(0, 500)}`
        );
      }

      // Record audit information
      if (config.execution.audit?.saveMessages) {
        await fs.writeFile(
          path.join(context.auditDir, `${context.sessionId}-${node.id}-${claudeCodeSessionId}-${attempt}-messages.json`),
          JSON.stringify({
            duration: Date.now() - startTime,
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            workDir
          }, null, 2)
        );
      }

      // Validate output
      if (!resume) {
        return output;
      }

      if (!validator) {
        validator = new Function('output', `return ${resume.validator}`);
      }

      if (validator(output) === true) {
        return output;
      }

    }

    throw new Error(`Node ${node.id}: failed after ${config.resume?.maxAttempts} resumes`);
  }

  private async prepareWorkDir(
    context: ExecutionContext
  ): Promise<string> {

    const fullPath = path.join(context.outputDir, context.sessionId);

    await fs.mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  private async renderContextMarkdown(
    config: ClaudeCodeConfig,
    inputs: Record<string, any>,
    outputPath: string,
    context: ExecutionContext
  ): Promise<void> {
    // Read the base markdown. Relative paths are resolved from workflowDir.
    const promptPath = path.isAbsolute(config.prompt.markdown)
      ? config.prompt.markdown
      : path.join(context.workflowDir, config.prompt.markdown);

    let content = await fs.readFile(promptPath, 'utf-8');

    // Render template when enabled
    if (config.prompt.template) {
      const template = Handlebars.compile(content);
      content = template(inputs);
    }

    // Inject inputs when inputMapping is configured
    if (config.inputMapping) {
      for (const [inputName, mapping] of Object.entries(config.inputMapping)) {
        if (mapping.target === 'markdown' && mapping.section) {
          const sectionMarker = `<!-- SECTION: ${mapping.section} -->`;
          const inputValue = JSON.stringify(inputs[inputName], null, 2);
          content = content.replace(
            sectionMarker,
            `${sectionMarker}\n\n\`\`\` json\n${inputValue}\n\`\`\``
          );
        }
      }
    } else {
      for (const [iName, iValue] of Object.entries(inputs)) {
        const sectionMarker = `<!-- SECTION: ${iName} -->`;
        const inputValue = JSON.stringify(iValue, null, 2);
        content = content.replace(
          sectionMarker,
          `${sectionMarker}\n\n\`\`\` json\n${inputValue}\n\`\`\``
        );
      }
    }

    await fs.writeFile(outputPath, content);
  }

  private buildClaudeArgs(
    config: ClaudeCodeConfig,
    context: string,
    outputSchema?: any
  ): string[] {
    var allowedTools = config.capabilities.tools?.allowed || [];

    const args: string[] = [
      '-p',
      context,
      '--output-format', 'json',
    ];

    if (!config.capabilities.enableSkills) {
      args.push('--disable-slash-commands');
    }

    // JSON Schema output constraint
    if (outputSchema) {
      args.push('--json-schema', JSON.stringify(outputSchema));
    }

    // Append MCP tools to allowedTools
    if (config.capabilities.mcp?.enabled) {
      allowedTools = allowedTools.concat(config.capabilities.mcp.enabled.map(mcp => `mcp__${mcp}__*`));
    }

    // Tool restrictions
    if (allowedTools.length > 0) {
      args.push('--allowed-tools', allowedTools.join(','));
    }
    if (config.capabilities.tools?.denied) {
      args.push('--disallowed-tools', config.capabilities.tools.denied.join(','));
    }

    // MCP
    if (config.capabilities.mcp?.config) {
      args.push('--mcp-config', config.capabilities.mcp.config);
    }

    return args;
  }
}

