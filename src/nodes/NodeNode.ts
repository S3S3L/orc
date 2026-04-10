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

    // 解析脚本路径
    const scriptPath = path.isAbsolute(config.script)
      ? config.script
      : path.join(context.workflowDir, config.script);

    // 构建命令参数
    const args: string[] = [];
    let stdinData: string | undefined;

    const runtime = config.runtime || 'node';
    const argsPassing = config.argsPassing ?? { type: 'stdin' as const };

    // 处理参数传递
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

    // 执行脚本
    const execaOptions: any = {
      cwd: tempDir,
      timeout: config.timeout ?? 300000,
      all: true,
      reject: false
    };

    // 只有在有 stdin 数据时才传递 input
    if (argsPassing.type === 'stdin' && Object.keys(inputs).length > 0) {
      execaOptions.input = stdinData;
    } else if (argsPassing.type === 'file') {
      execaOptions.input = stdinData;
    }

    const result = await execa(runtime, [scriptPath, ...args], execaOptions);

    // 检查执行结果
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

    // 解析 JSON 输出
    try {
      return JSON.parse(result.stdout);
    } catch (e) {
      throw new Error(
        `Node ${node.id}: script output is not valid JSON: ${result.stdout.slice(0, 200)}`
      );
    }
  }
}
