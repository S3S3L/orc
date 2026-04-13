import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import Handlebars from 'handlebars';
import { readFileSync } from 'fs';
import type { NodeDefinition, ExecutionContext, ClaudeCodeConfig } from '../types.js';
import type { NodeExecutor } from '../core/Executor.js';

export class ClaudeCodeNode implements NodeExecutor {
  async execute(
    node: NodeDefinition,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.config as ClaudeCodeConfig;
    const startTime = Date.now();

    // 1. 准备工作目录
    const workDir = await this.prepareWorkDir(config, context);

    // 2. 渲染配置文件模板
    if (config.configTemplates) {
      await this.renderConfigTemplates(config, inputs, context);
    }

    // 3. 渲染并写入上下文 markdown
    const contextMdPath = path.join(workDir, 'context.md');
    await this.renderContextMarkdown(config, inputs, contextMdPath, context);

    // 4. 构建 claude 命令（使用节点的 output schema 作为 JSON Schema 约束）
    const args = this.buildClaudeArgs(config, contextMdPath, node.output);

    // 5. 执行 claude
    const result = await execa('claude', args, {
      cwd: workDir,
      timeout: config.timeout ?? 300000,
      all: true,
      reject: false,
      buffer: true,
      stdin: 'ignore'  // 忽略 stdin 避免警告
    });

    // 6. 读取输出（--output-format json 时，stdout 直接是 JSON）
    let output: any;
    try {
      // 首先尝试解析 stdout（--output-format json 直接输出 JSON）
      const rawOutput = JSON.parse(result.stdout);

      // 如果有 structured_output，使用它作为实际输出（去除元数据）
      if (rawOutput.structured_output) {
        output = rawOutput.structured_output;
      } else {
        output = rawOutput;
      }
    } catch (e) {
      // 尝试从输出文件中读取
      try {
        const outputPath = path.join(workDir, config.execution.outputFile);
        const outputContent = await fs.readFile(outputPath, 'utf-8');
        output = JSON.parse(outputContent);
      } catch {
        throw new Error(
          `Node ${node.id}: could not parse output as JSON. stdout: ${result.stdout.slice(0, 500)}`
        );
      }
    }

    // 7. 记录审计信息
    if (config.execution.audit?.saveMessages) {
      await fs.writeFile(
        path.join(context.auditDir, `${context.sessionId}-${node.id}-messages.json`),
        JSON.stringify({
          duration: Date.now() - startTime,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          workDir
        }, null, 2)
      );
    }

    return output;
  }

  private async prepareWorkDir(
    config: ClaudeCodeConfig,
    context: ExecutionContext
  ): Promise<string> {
    // 渲染工作目录路径（支持模板变量）
    const template = Handlebars.compile(config.execution.workDir);
    const workDir = template({
      sessionId: context.sessionId,
      nodeId: context.sessionId
    });

    const fullPath = path.isAbsolute(workDir)
      ? workDir
      : path.join(context.outputDir, workDir);

    await fs.mkdir(fullPath, { recursive: true });
    return fullPath;
  }

  private async renderContextMarkdown(
    config: ClaudeCodeConfig,
    inputs: Record<string, any>,
    outputPath: string,
    context: ExecutionContext
  ): Promise<void> {
    // 读取基础 markdown - 支持相对路径（相对于 workflowDir）
    const promptPath = path.isAbsolute(config.prompt.markdown)
      ? config.prompt.markdown
      : path.join(context.workflowDir, config.prompt.markdown);

    let content = await fs.readFile(promptPath, 'utf-8');

    // 如果启用模板，渲染它
    if (config.prompt.template) {
      const template = Handlebars.compile(content);
      content = template(inputs);
    }

    // 如果配置了 inputMapping，注入输入
    if (config.inputMapping) {
      for (const [inputName, mapping] of Object.entries(config.inputMapping)) {
        if (mapping.target === 'markdown' && mapping.section) {
          const sectionMarker = `<!-- SECTION: ${mapping.section} -->`;
          const inputValue = JSON.stringify(inputs[inputName], null, 2);
          content = content.replace(
            sectionMarker,
            `${sectionMarker}\n\n${inputValue}`
          );
        }
      }
    }

    await fs.writeFile(outputPath, content);
  }

  private buildClaudeArgs(
    config: ClaudeCodeConfig,
    contextMdPath: string,
    outputSchema?: any
  ): string[] {
    // 读取 context markdown 内容直接作为 prompt（避免 shell 展开问题）
    const contextContent = readFileSync(contextMdPath, 'utf-8');
    var allowedTools = config.capabilities.tools?.allowed || [];

    const args: string[] = [
      '-p',
      contextContent,
      '--output-format', 'json'
    ];

    // JSON Schema 输出约束
    if (outputSchema) {
      args.push('--json-schema', JSON.stringify(outputSchema));
    }

    // 追加mcp工具到 allowedTools
    if (config.capabilities.mcp?.enabled) {
      allowedTools = allowedTools.concat(config.capabilities.mcp.enabled.map(mcp => `mcp__${mcp}__*`));
    }

    // 工具限制
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

  private async renderConfigTemplates(
    config: ClaudeCodeConfig,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<void> {
    if (!config.configTemplates) return;

    for (const tmpl of config.configTemplates) {
      // 模板路径支持相对路径（相对于 workflowDir）
      const templatePath = path.isAbsolute(tmpl.template)
        ? tmpl.template
        : path.join(context.workflowDir, tmpl.template);

      const templateContent = await fs.readFile(templatePath, 'utf-8');
      const template = Handlebars.compile(templateContent);
      const content = template(inputs);

      // 解析目标路径（支持 ~ 展开）
      let targetPath = tmpl.path;
      if (targetPath.startsWith('~')) {
        targetPath = path.join(process.env.HOME || '', targetPath.slice(1));
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true });
      await fs.writeFile(targetPath, content);
    }
  }
}
