#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowGraph } from './core/Graph.js';
import { Executor } from './core/Executor.js';
import { BashNode } from './nodes/BashNode.js';
import { PythonNode } from './nodes/PythonNode.js';
import { NodeNode } from './nodes/NodeNode.js';
import { ClaudeCodeNode } from './nodes/ClaudeCodeNode.js';
import type { WorkflowDefinition, ExecutionContext } from './types.js';

const program = new Command();

// 全局状态用于 Web UI
let lastWorkflow: WorkflowDefinition | null = null;
let lastContext: ExecutionContext | null = null;
let executionStates = new Map<string, any>();

program
  .name('orc')
  .description('Orchestration Runner - JSON-driven task orchestration tool')
  .version('0.1.0');

program
  .command('run <workflow>')
  .description('Run a workflow')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-w, --workspace <dir>', 'Workspace directory for temp files', './workspace')
  .option('--audit <dir>', 'Audit log directory', './audit')
  .option('-v, --verbose', 'Verbose output')
  .action(async (workflowPath: string, options) => {
    try {
      // 加载工作流
      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow: WorkflowDefinition = JSON.parse(workflowContent);

      // 构建图
      const graph = new WorkflowGraph(workflow);

      // 准备上下文
      const context: ExecutionContext = {
        workflowDir: path.dirname(path.resolve(workflowPath)),
        outputDir: path.resolve(options.output),
        auditDir: path.resolve(options.audit),
        tempBaseDir: path.resolve(options.workspace),
        sessionId: `session-${uuidv4()}`,
        nodeOutputs: new Map(),
        auditLog: []
      };

      // 执行
      const executor = new Executor(graph, context);

      // 注册所有执行器
      executor.registerExecutor('bash', new BashNode());
      executor.registerExecutor('python', new PythonNode());
      executor.registerExecutor('node', new NodeNode());
      executor.registerExecutor('claude-code', new ClaudeCodeNode());

      const outputs = await executor.execute();

      // 输出结果
      console.log('Workflow completed. Outputs:');
      for (const [nodeId, output] of outputs.entries()) {
        console.log(`  ${nodeId}:`, JSON.stringify(output, null, 2));
      }

      console.log(`\nOutputs saved to: ${context.outputDir}`);
      console.log(`Audit logs saved to: ${context.auditDir}`);

    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('validate <workflow>')
  .description('Validate a workflow definition')
  .action(async (workflowPath: string) => {
    try {
      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow: WorkflowDefinition = JSON.parse(workflowContent);

      const graph = new WorkflowGraph(workflow);

      console.log('✓ Workflow is valid');
      console.log(`  Nodes: ${graph.size}`);
      console.log(`  Execution order: ${graph.getExecutionOrder().join(' → ')}`);

    } catch (error) {
      console.error('✗ Validation failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program
  .command('serve [workflow]')
  .description('Start web UI server')
  .option('-p, --port <port>', 'Port number', '3000')
  .option('-H, --host <host>', 'Host to bind', '0.0.0.0')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-w, --workspace <dir>', 'Workspace directory', './workspace')
  .option('--audit <dir>', 'Audit log directory', './audit')
  .action(async (workflowPath: string | undefined, options) => {
    const http = await import('http');

    let workflowDir = process.cwd();
    if (workflowPath) {
      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      lastWorkflow = JSON.parse(workflowContent);
      workflowDir = path.resolve(path.dirname(workflowPath));
    }

    const webDir = path.join(__dirname, 'web');
    const indexHtml = await fs.readFile(path.join(webDir, 'index.html'), 'utf-8');

    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url || '/', `http://localhost:${options.port}`);

      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Content-Type', 'application/json');

      if (url.pathname === '/' || url.pathname === '/index.html') {
        res.setHeader('Content-Type', 'text/html');
        res.end(indexHtml);
        return;
      }

      if (url.pathname === '/api/workflow' && req.method === 'GET') {
        if (!lastWorkflow) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'No workflow loaded' }));
          return;
        }
        res.end(JSON.stringify(lastWorkflow));
        return;
      }

      if (url.pathname === '/api/run' && req.method === 'POST') {
        if (!lastWorkflow) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'No workflow loaded' }));
          return;
        }

        const sessionId = `session-${uuidv4()}`;

        // 先设置状态
        executionStates.set(sessionId, {
          status: 'running',
          nodes: {},
          logs: [`Workflow started: ${sessionId}`],
          startTime: Date.now(),
          complete: false  // 初始化为 false
        });

        // 异步执行工作流
        const executionPromise = runWorkflow(lastWorkflow, options, sessionId, workflowDir);

        // 后台执行
        executionPromise.then(() => {
          const state = executionStates.get(sessionId);
          if (state) {
            state.status = 'complete';
            state.complete = true;  // 添加 complete 字段供前端判断
          }
        }).catch((err) => {
          const state = executionStates.get(sessionId);
          if (state) {
            state.status = 'failed';
            state.error = err.message;
            state.complete = true;  // 失败也标记为完成
          }
        });

        res.end(JSON.stringify({ sessionId }));
        return;
      }

      if (url.pathname.startsWith('/api/status/') && req.method === 'GET') {
        const sessionId = url.pathname.replace('/api/status/', '');
        const state = executionStates.get(sessionId);

        if (!state) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'Session not found' }));
          return;
        }

        res.end(JSON.stringify(state));
        return;
      }

      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    server.listen(options.port, options.host, () => {
      const displayHost = options.host === '0.0.0.0' ? '0.0.0.0' : options.host;
      console.log(`ORC Web UI started at http://${displayHost}:${options.port}`);
      console.log(`Access via: http://localhost:${options.port}`);
      console.log(`Loaded workflow: ${workflowPath || 'none'}`);
      console.log('Press Ctrl+C to stop');
    });
  });

async function runWorkflow(workflow: WorkflowDefinition, options: any, sessionId: string, workflowDir: string) {
  // 初始化目录
  const outputDir = path.resolve(options.output);
  const auditDir = path.resolve(options.audit);
  const tempBaseDir = path.resolve(options.workspace);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(auditDir, { recursive: true });
  await fs.mkdir(tempBaseDir, { recursive: true });

  const graph = new WorkflowGraph(workflow);

  const context: ExecutionContext = {
    workflowDir,
    outputDir,
    auditDir,
    tempBaseDir,
    sessionId,
    nodeOutputs: new Map(),
    auditLog: []
  };

  const executor = new Executor(graph, context);
  executor.registerExecutor('bash', new BashNode());
  executor.registerExecutor('python', new PythonNode());
  executor.registerExecutor('node', new NodeNode());
  executor.registerExecutor('claude-code', new ClaudeCodeNode());

  // 获取状态引用并检查是否存在
  let state = executionStates.get(sessionId);
  if (!state) {
    console.error(`[${new Date().toISOString()}] [Web ${sessionId}] State not found`);
    return;
  }

  const ts = () => new Date().toISOString();

  // 初始化所有节点状态为 pending
  for (const node of workflow.nodes) {
    state.nodes[node.id] = { status: 'pending' };
  }

  console.log(`\n[${ts()}] [Web ${sessionId}] Workflow execution started`);
  console.log(`[${ts()}] [Web ${sessionId}] Workflow: ${workflow.name}`);
  console.log(`[${ts()}] [Web ${sessionId}] Nodes: ${workflow.nodes.length}`);
  console.log(`[${ts()}] [Web ${sessionId}] -------------------`);

  try {
    // 使用 Executor 执行工作流，支持条件分支和实时状态更新
    const groups = graph.getParallelGroups();

    for (const group of groups) {
      // 为组内每个节点设置 running 状态
      for (const nodeId of group) {
        state.nodes[nodeId] = { status: 'running' };
        console.log(`[${ts()}] [Web ${sessionId}] → ${nodeId} started`);
      }

      // 并行执行组内所有节点，每个节点完成后立即更新状态
      const nodePromises = group.map(async (nodeId) => {
        const node = graph.getNode(nodeId);
        if (!node) throw new Error(`Node ${nodeId} not found`);

        const tempDir = path.join(context.tempBaseDir, `${nodeId}-${uuidv4()}`);
        await fs.mkdir(tempDir, { recursive: true });

        const nodeContext: ExecutionContext = {
          ...context,
          tempBaseDir: tempDir
        };

        // 使用 Executor 的内部方法执行节点（支持条件分支）
        try {
          // 调用 executeNode 来执行，它会处理条件评估和跳过逻辑
          await executor['executeNode'](nodeId);

          const output = context.nodeOutputs.get(nodeId);

          // 检查节点是否被跳过
          if (output?.__skipped === true) {
            state.nodes[nodeId] = { status: 'skipped', output };
            if (state.logs) {
              state.logs.push(`⊘ ${nodeId} skipped`);
            }
            console.log(`[${ts()}] [Web ${sessionId}] ⊘ ${nodeId} skipped`);
          } else {
            // 节点成功执行
            state.nodes[nodeId] = { status: 'success', output };
            if (state.logs) {
              state.logs.push(`✓ ${nodeId} completed`);
            }
            console.log(`[${ts()}] [Web ${sessionId}] ✓ ${nodeId} completed`);

            // 持久化输出
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const filePath = path.join(context.outputDir, `${nodeId}-${timestamp}.json`);
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, JSON.stringify(output, null, 2));
          }
        } catch (err) {
          // 节点执行失败
          state.nodes[nodeId] = { status: 'failed', error: err instanceof Error ? err.message : String(err) };
          if (state.logs) {
            state.logs.push(`✗ ${nodeId}: ${err instanceof Error ? err.message : String(err)}`);
          }
          console.log(`[${ts()}] [Web ${sessionId}] ✗ ${nodeId}: ${err instanceof Error ? err.message : String(err)}`);
          throw err;
        }

        return { nodeId, output: context.nodeOutputs.get(nodeId) };
      });

      // 等待组内所有节点完成
      await Promise.all(nodePromises);
    }

    state.status = 'complete';
    console.log(`[${ts()}] [Web ${sessionId}] -------------------`);
    console.log(`[${ts()}] [Web ${sessionId}] Workflow completed successfully`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (state.logs) {
      state.logs.push(`✗ Error: ${errorMsg}`);
    }
    state.status = 'failed';
    state.error = errorMsg;
    console.log(`[${ts()}] [Web ${sessionId}] ✗ Error: ${errorMsg}`);
    console.log(`[${ts()}] [Web ${sessionId}] Workflow failed`);
    throw error;
  }
}

program.parse();
