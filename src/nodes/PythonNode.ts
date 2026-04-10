import { execa } from 'execa';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { NodeDefinition, ExecutionContext, PythonConfig } from '../types.js';
import type { NodeExecutor } from '../core/Executor.js';

export class PythonNode implements NodeExecutor {
  async execute(
    node: NodeDefinition,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<any> {
    const config = node.config as PythonConfig;
    const tempDir = context.tempBaseDir;

    // 解析脚本路径
    const scriptPath = path.isAbsolute(config.script)
      ? config.script
      : path.join(context.workflowDir, config.script);

    // 检查依赖
    if (config.requirements) {
      await this.checkRequirements(config, tempDir);
    }

    // 构建命令参数
    const args: string[] = [];
    let stdinData: string | undefined;

    const interpreter = config.interpreter || 'python3';
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

            if (mapping.type === 'string') {
              args.push(String(value));
            } else if (mapping.type === 'file') {
              const fileName = `input_${inputName}.txt`;
              const filePath = path.join(tempDir, fileName);
              await fs.writeFile(filePath, String(value));
              args.push(filePath);
            }
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
    const result = await execa(interpreter, [scriptPath, ...args], {
      cwd: tempDir,
      input: stdinData,
      timeout: config.timeout ?? 300000,
      all: true,
      reject: false
    });

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

  private async checkRequirements(
    config: PythonConfig,
    tempDir: string
  ): Promise<void> {
    const { file, packages } = config.requirements!;

    if (file) {
      // 从 requirements.txt 读取
      const content = await fs.readFile(file, 'utf-8');
      const required = content.split('\n').filter(line => line.trim());
      await this.verifyPackages(required);
    } else if (packages) {
      await this.verifyPackages(packages);
    }
  }

  private async verifyPackages(packages: string[]): Promise<void> {
    // 可选：检查包是否安装
    // 这里可以添加 pip show 检查逻辑
  }
}
