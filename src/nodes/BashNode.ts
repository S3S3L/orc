import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import Handlebars from 'handlebars';
import type { NodeDefinition, ExecutionContext, BashConfig } from '../types.js';
import type { NodeExecutor } from '../core/Executor.js';

export class BashNode implements NodeExecutor {
  async execute(
    node: NodeDefinition,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.config as BashConfig;
    const tempDir = context.tempBaseDir;

    // 解析脚本路径
    const scriptPath = path.isAbsolute(config.script)
      ? config.script
      : path.join(context.workflowDir, config.script);

    // 构建命令参数
    const args: string[] = [];
    const env: Record<string, string> = {};
    let stdinData: string | undefined;

    // 处理参数传递
    switch (config.argsPassing.type) {
      case 'stdin':
        stdinData = JSON.stringify(inputs);
        break;

      case 'args':
        if (config.argsPassing.argMapping) {
          for (const [inputName, mapping] of Object.entries(config.argsPassing.argMapping)) {
            const value = inputs[inputName];

            if (mapping.type === 'string') {
              args[mapping.position ?? args.length] = String(value);
            } else if (mapping.type === 'file') {
              // 写入临时文件
              const fileName = `input_${inputName}.txt`;
              const filePath = path.join(tempDir, fileName);
              await fs.writeFile(filePath, String(value));
              args[mapping.position ?? args.length] = filePath;
            } else if (mapping.type === 'raw') {
              const template = Handlebars.compile(mapping.template || '{{value}}');
              args[mapping.position ?? args.length] = template({ value });
            }
          }
        }
        break;

      case 'file':
        const fileName = config.argsPassing.fileName || 'input.json';
        const inputFilePath = path.join(tempDir, fileName);
        await fs.writeFile(inputFilePath, JSON.stringify(inputs, null, 2));
        args.push(inputFilePath);
        break;
    }

    // 处理环境变量映射
    if (config.envMapping) {
      for (const [envName, inputName] of Object.entries(config.envMapping)) {
        if (inputs[inputName] !== undefined) {
          env[envName] = String(inputs[inputName]);
        }
      }
    }

    // 执行脚本
    const interpreter = config.interpreter || 'bash';
    const execaOptions: any = {
      cwd: tempDir,
      env,
      timeout: config.timeout ?? 300000,
      all: true,
      reject: false
    };

    // 只有在有 stdin 数据时才传递 input
    // 这避免了当脚本不读取 stdin 时的 EPIPE 错误
    if (config.argsPassing.type === 'stdin' && Object.keys(inputs).length > 0) {
      execaOptions.input = stdinData;
    } else if (config.argsPassing.type === 'file') {
      execaOptions.input = stdinData;
    }

    const result = await execa(interpreter, [scriptPath, ...args], execaOptions);

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
