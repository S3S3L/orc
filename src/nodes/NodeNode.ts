import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { NodeDefinition, ExecutionContext, NodeConfig } from '../types.js';
import type { NodeExecutor } from '../core/Executor.js';

export class NodeNode implements NodeExecutor {
  async execute(
    node: NodeDefinition,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.config as NodeConfig;
    const tempDir = context.tempBaseDir;

    // Resolve script path
    const scriptPath = path.isAbsolute(config.script)
      ? config.script
      : path.join(context.workflowDir, config.script);

    // Build command arguments
    const args: string[] = [];
    let stdinData: string | undefined;

    const runtime = config.runtime || 'node';
    const argsPassing = config.argsPassing ?? { type: 'stdin' as const };

    // Handle argument passing
    switch (argsPassing.type) {
      case 'stdin':
        stdinData = JSON.stringify(inputs);
        break;

      case 'args':
        if (argsPassing.argMapping) {
          for (const [inputName, mapping] of Object.entries(argsPassing.argMapping)) {
            const value = inputs[inputName];
            args.push(String(value));
          }
        }
        break;

      case 'file':
        const fileName = argsPassing.fileName || 'input.json';
        const inputFilePath = path.join(tempDir, fileName);
        await fs.writeFile(inputFilePath, JSON.stringify(inputs, null, 2));
        args.push(inputFilePath);
        break;
    }

    // Execute script
    const execaOptions: any = {
      cwd: tempDir,
      timeout: config.timeout ?? 300000,
      all: true,
      env: {
        WORKFLOW_HOME: context.workflowDir,
      },
      reject: false
    };

    // Only pass stdin when input data exists
    if (argsPassing.type === 'stdin' && Object.keys(inputs).length > 0) {
      execaOptions.input = stdinData;
    } else if (argsPassing.type === 'file') {
      execaOptions.input = stdinData;
    }

    const result = await execa(runtime, [scriptPath, ...args], execaOptions);

    // Check execution result
    if (result.exitCode === null || result.exitCode === undefined) {
      throw new Error(
        `Node ${node.id}: script failed to execute: ${String(result.stderr || result.stdout || 'unknown error')}`
      );
    }

    if (result.exitCode !== 0) {
      throw new Error(
        `Node ${node.id}: script failed with exit code ${result.exitCode}\n${result.all}`
      );
    }

    // Parse JSON output
    try {
      return JSON.parse(result.stdout);
    } catch (e) {
      throw new Error(
        `Node ${node.id}: script output is not valid JSON: ${result.stdout.slice(0, 200)}`
      );
    }
  }
}
