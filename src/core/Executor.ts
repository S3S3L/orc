import Ajv from 'ajv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowGraph } from './Graph.js';
import { AuditLogger } from '../runtime/AuditLogger.js';
import type { ExecutionContext, NodeDefinition, NodeType, EdgeDefinition, RetryConfig } from '../types.js';

// 节点执行器接口
export interface NodeExecutor {
  execute(
    node: NodeDefinition,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<any>;
}

export class Executor {
  private graph: WorkflowGraph;
  private ajv: Ajv;
  private audit: AuditLogger;
  private context: ExecutionContext;
  private executors: Map<string, NodeExecutor> = new Map();
  private workflowStopped: boolean = false;  // 工作流停止标志

  constructor(
    graph: WorkflowGraph,
    context: ExecutionContext
  ) {
    this.graph = graph;
    this.context = context;
    this.ajv = new Ajv({ allErrors: true });
    this.audit = new AuditLogger(context.auditDir);
  }

  /**
   * 注册节点执行器
   */
  registerExecutor(type: NodeType, executor: NodeExecutor): void {
    this.executors.set(type, executor);
  }

  /**
   * 执行工作流
   */
  async execute(): Promise<Map<string, any>> {
    // 初始化目录
    await this.initializeDirectories();

    // 使用并行组执行
    const groups = this.graph.getParallelGroups();

    for (const group of groups) {
      // 并行执行同一组的所有节点
      await Promise.all(group.map(nodeId => this.executeNode(nodeId)));
    }

    return this.context.nodeOutputs;
  }

  /**
   * 初始化目录
   */
  private async initializeDirectories(): Promise<void> {
    await fs.mkdir(this.context.outputDir, { recursive: true });
    await fs.mkdir(this.context.auditDir, { recursive: true });
    await fs.mkdir(this.context.tempBaseDir, { recursive: true });
  }

  /**
   * 执行单个节点（支持重试）
   */
  private async executeNode(nodeId: string): Promise<void> {
    const node = this.graph.getNode(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    // 为本次执行创建唯一临时目录
    const tempDir = path.join(this.context.tempBaseDir, `${nodeId}-${uuidv4()}`);
    await fs.mkdir(tempDir, { recursive: true });

    const auditEntry = this.audit.start(nodeId, { tempDir });

    // 获取重试配置
    const retryConfig = (node.config as any).retry ?? {};
    const maxAttempts = retryConfig.maxAttempts ?? 3;
    const backoff = retryConfig.backoff ?? 'exponential';
    const baseDelay = retryConfig.delayMs ?? 1000;

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.executeNodeInternal(nodeId, node, auditEntry, tempDir);
        return; // 成功则返回
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt < maxAttempts) {
          // 计算延迟时间
          const delay = backoff === 'exponential'
            ? baseDelay * Math.pow(2, attempt - 1)
            : baseDelay;

          auditEntry.error = lastError.message;
          auditEntry.retry = { attempt, maxAttempts, delay };
          this.audit.update(auditEntry, 'retry');

          // 等待后重试
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    // 所有重试失败
    auditEntry.error = lastError?.message ?? 'Unknown error';
    this.audit.error(auditEntry);
    throw lastError;
  }

  /**
   * 执行单个节点的逻辑（不含重试）
   */
  private async executeNodeInternal(
    nodeId: string,
    node: NodeDefinition,
    auditEntry: any,
    tempDir: string
  ): Promise<void> {
    try {
      // 1. 收集并校验输入
      const inputs = this.collectInputs(node);
      this.validateInputs(node, inputs);

      auditEntry.inputs = inputs;
      this.audit.update(auditEntry, 'validate');

      // 2. 创建节点执行上下文
      const nodeContext: ExecutionContext = {
        ...this.context,
        tempBaseDir: tempDir
      };

      // 3. 执行节点
      const executor = this.executors.get(node.type);
      if (!executor) {
        throw new Error(`No executor registered for node type: ${node.type}`);
      }

      const rawOutput = await executor.execute(node, inputs, nodeContext);

      // 4. 处理输出
      const output = await this.processOutput(node, rawOutput, tempDir);

      // 5. 校验输出 Schema
      this.validateOutput(node, output);

      // 6. 保存输出到持久化目录
      const outputFilePath = await this.persistOutput(nodeId, output);

      // 7. 记录结果
      this.context.nodeOutputs.set(nodeId, output);
      auditEntry.outputs = output;
      auditEntry.persistedFiles = {
        output: outputFilePath
      };
      this.audit.complete(auditEntry);

    } catch (error) {
      throw error;
    }
  }

  /**
   * 收集节点输入（支持条件边和动态路由）
   */
  private collectInputs(node: NodeDefinition): Record<string, any> {
    const inputs: Record<string, any> = {};
    const edges = this.graph.getIncomingEdges(node.id);

    for (const edge of edges) {
      // 检查边条件
      if (edge.condition) {
        const conditionResult = this.evaluateEdgeCondition(edge, node.id);

        // 处理条件结果
        if (conditionResult.action === 'stop') {
          // 停止工作流
          this.workflowStopped = true;
          throw new Error(`Workflow stopped at edge ${edge.id}: condition not met`);
        }

        if (conditionResult.action === 'skip') {
          // 跳过这条边
          continue;
        }

        if (conditionResult.action === 'skip-node') {
          // 跳过整个节点
          throw new Error(`Node ${node.id}: skipped due to condition on edge ${edge.id}`);
        }

        if (conditionResult.action === 'error') {
          throw new Error(`Node ${node.id}: edge ${edge.id} condition not met`);
        }

        // 处理动态路由 - 检查是否有匹配的分支
        if (conditionResult.action === 'route' && conditionResult.target) {
          // 如果当前节点不是路由目标，跳过这条边
          if (conditionResult.target.nodeId !== node.id) {
            continue;
          }
          // 使用路由目标指定的输入名
          edge.input = conditionResult.target.input;
        }
      }

      const sourceOutput = this.context.nodeOutputs.get(edge.from);
      if (sourceOutput === undefined) {
        throw new Error(
          `Node ${node.id}: input '${edge.input}' depends on unexecuted node ${edge.from}`
        );
      }
      inputs[edge.input] = sourceOutput;
    }

    return inputs;
  }

  /**
   * 评估边条件（支持动态路由）
   * 返回：{ action: 'continue' | 'skip' | 'skip-node' | 'stop' | 'error' | 'route', target?: { nodeId, input } }
   */
  private evaluateEdgeCondition(
    edge: { id: string; from: string; input: string; condition?: {
      expression: string;
      onFalse?: 'skip' | 'skip-node' | 'stop' | 'error';
      branches?: Array<{ expression: string; to: { nodeId: string; input: string } }>;
    }
  }, nodeId: string): {
    action: 'continue' | 'skip' | 'skip-node' | 'stop' | 'error' | 'route';
    target?: { nodeId: string; input: string }
  } {
    if (!edge.condition) {
      return { action: 'continue' };
    }

    const { expression, onFalse, branches } = edge.condition;

    try {
      // 简单的条件求值 - 支持基于上游节点输出的表达式
      const conditionFn = new Function('outputs', `return ${expression}`);
      const result = conditionFn(Object.fromEntries(this.context.nodeOutputs));

      if (!!result) {
        // 条件为真，检查是否有 branches 路由
        if (branches && branches.length > 0) {
          // 评估分支条件
          for (const branch of branches) {
            const branchFn = new Function('outputs', `return ${branch.expression}`);
            const branchResult = branchFn(Object.fromEntries(this.context.nodeOutputs));
            if (!!branchResult) {
              return { action: 'route', target: branch.to };
            }
          }
          // 没有匹配的分支，继续到默认目标
          return { action: 'continue' };
        }
        return { action: 'continue' };
      }

      // 条件为假，根据 onFalse 配置处理
      switch (onFalse) {
        case 'skip':
          return { action: 'skip' };
        case 'skip-node':
          return { action: 'skip-node' };
        case 'stop':
          return { action: 'stop' };
        case 'error':
          return { action: 'error' };
        default:
          // 默认跳过
          return { action: 'skip' };
      }
    } catch (e) {
      throw new Error(`Node ${nodeId}: edge ${edge.id} condition evaluation failed: ${e}`);
    }
  }

  /**
   * 校验输入 Schema
   */
  private validateInputs(node: NodeDefinition, inputs: Record<string, any>): void {
    for (const [inputName, schema] of Object.entries(node.inputs)) {
      const validate = this.ajv.compile(schema);
      const value = inputs[inputName];

      if (value === undefined) {
        throw new Error(`Node ${node.id}: missing required input '${inputName}'`);
      }

      if (!validate(value)) {
        throw new Error(
          `Node ${node.id}: input '${inputName}' validation failed: ${
            this.ajv.errorsText(validate.errors)
          }`
        );
      }
    }
  }

  /**
   * 处理输出（应用 outputMapping）
   */
  private async processOutput(
    node: NodeDefinition,
    rawOutput: any,
    tempDir: string
  ): Promise<any> {
    const config = node.config as any;
    const outputMapping = config.outputMapping;

    if (!outputMapping) {
      return rawOutput;
    }

    let output = rawOutput;

    // 提取字段
    if (outputMapping.extractField) {
      const fields = outputMapping.extractField.split('.');
      for (const field of fields) {
        output = output?.[field];
      }
      if (output === undefined) {
        throw new Error(
          `Node ${node.id}: outputMapping.extractField '${outputMapping.extractField}' not found`
        );
      }
    }

    // 转换脚本
    if (outputMapping.transformScript) {
      const transformScript = path.resolve(this.context.workflowDir, outputMapping.transformScript);
      const { execa } = await import('execa');
      const result = await execa('node', [transformScript], {
        input: JSON.stringify(output),
        cwd: tempDir
      });
      output = JSON.parse(result.stdout);
    }

    return output;
  }

  /**
   * 持久化输出
   */
  private async persistOutput(nodeId: string, output: any): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = path.join(this.context.outputDir, `${nodeId}-${timestamp}.json`);
    await fs.writeFile(filePath, JSON.stringify(output, null, 2));
    return filePath;
  }

  /**
   * 校验输出 Schema
   */
  private validateOutput(node: NodeDefinition, output: any): void {
    const validate = this.ajv.compile(node.output);
    if (!validate(output)) {
      throw new Error(
        `Node ${node.id}: output validation failed: ${
          this.ajv.errorsText(validate.errors)
        }`
      );
    }
  }
}
