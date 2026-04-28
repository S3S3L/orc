#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowGraph } from './core/Graph.js';
import { Executor } from './core/Executor.js';
import type { WorkflowDefinition, ExecutionContext, ExecutionState, SessionSummary } from './types.js';
import { GLOBAL_CONTEXT } from './utils/GlobalContext.js';

const program = new Command();

program
  .name('orc')
  .description('Orchestration Runner - JSON-driven task orchestration tool')
  .version('0.7.2');

program
  .command('run <workflow>')
  .description('Run a workflow')
  .option('-o, --output <dir>', 'Output directory', './output')
  .option('-s, --sessionId <id>', 'Session ID', uuidv4())
  .option('-S, --single', 'Is single node execution (for debugging)')
  .option('-i, --nodeId <id>', 'Node ID for execution (for debugging)')
  .option('-w, --workspace <dir>', 'Workspace directory for temp files', './workspace')
  .option('--audit <dir>', 'Audit log directory', './audit')
  .option('-v, --verbose', 'Verbose output')
  .option('-c, --cleanOldFiles', 'Clean old files in output directory before execution', false)
  .action(async (workflowPath: string, options) => {
    try {
      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow: WorkflowDefinition = JSON.parse(workflowContent);

      const workflowDir = path.dirname(path.resolve(workflowPath));
      const sessionId = options.sessionId;

      GLOBAL_CONTEXT.executionStates.set(sessionId, {
        status: 'running',
        logs: [],
        startTime: Date.now(),
        complete: false
      });

      await runWorkflow(workflow, options, sessionId, workflowDir, options.cleanOldFiles || false, options.nodeId, options.single);

      const state = GLOBAL_CONTEXT.executionStates.get(sessionId);
      if (state?.status === 'complete') {
        console.log('\n✓ Workflow completed successfully');
      }
      process.exit(0);

    } catch (error) {
      console.error('✗ Error:', error instanceof Error ? error.message : error);
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

      const workflowDir = path.dirname(path.resolve(workflowPath));
      const graph = new WorkflowGraph(workflow, workflowDir);

      console.log('✓ Workflow is valid');
      console.log(`  Nodes: ${graph.size}`);
      console.log(`  Execution order: ${graph.getExecutionOrder().join(' → ')}`);

    } catch (error) {
      console.error('✗ Validation failed:', error instanceof Error ? error.message : error, error instanceof Error ? error.stack : '');
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
    const { startServer } = await import('./server/server.js');

    if (workflowPath) {
      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      GLOBAL_CONTEXT.lastWorkflow = JSON.parse(workflowContent);
    }

    GLOBAL_CONTEXT.outputDir = path.resolve(options.output);
    GLOBAL_CONTEXT.auditDir = path.resolve(options.audit);
    GLOBAL_CONTEXT.workspaceDir = path.resolve(options.workspace);
    await GLOBAL_CONTEXT.setStorePath(GLOBAL_CONTEXT.outputDir);

    await startServer(workflowPath, {
      port: parseInt(options.port),
      host: options.host,
      outputDir: GLOBAL_CONTEXT.outputDir,
      auditDir: GLOBAL_CONTEXT.auditDir,
      workspaceDir: GLOBAL_CONTEXT.workspaceDir,
    });
  });

async function runWorkflow(
  workflow: WorkflowDefinition,
  options: any,
  sessionId: string,
  workflowDir: string,
  cleanOldFiles: boolean,
  startNodeId?: string,
  single?: boolean
) {
  const outputDir = path.resolve(options.output);
  const auditDir = path.resolve(options.audit);
  const tempBaseDir = path.resolve(options.workspace);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(auditDir, { recursive: true });
  await fs.mkdir(tempBaseDir, { recursive: true });

  const { executionStates, executions } = GLOBAL_CONTEXT;

  const graph = new WorkflowGraph(workflow, workflowDir);

  const context: ExecutionContext = {
    workflowDef: workflow,
    workflowDir,
    outputDir,
    auditDir,
    tempBaseDir,
    sessionId,
    nodeOutputs: new Map(),
    auditLog: [],
    debug: { startNodeId, single },
    cleanOldFiles
  };

  const executor = new Executor(graph, context);
  executions.set(sessionId, executor);

  let state = executionStates.get(sessionId);
  if (!state) {
    console.error(`[${new Date().toISOString()}] [${sessionId}] State not found`);
    return;
  }

  const ts = () => new Date().toISOString();

  console.log(`\n[${ts()}] [${sessionId}] Workflow execution started`);
  console.log(`[${ts()}] [${sessionId}] Workflow: ${workflow.name}`);
  console.log(`[${ts()}] [${sessionId}] Nodes: ${workflow.nodes.length}`);
  console.log(`[${ts()}] [${sessionId}] -------------------`);

  try {
    await executor.execute(context, state);

    state.status = 'complete';
    console.log(`[${ts()}] [${sessionId}] -------------------`);
    console.log(`[${ts()}] [${sessionId}] Workflow completed successfully`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    if (state.logs) {
      state.logs.push(`✗ Error: ${errorMsg}`);
    }
    state.status = 'error';
    state.error = errorMsg;
    console.log(`[${ts()}] [${sessionId}] ✗ Error: ${errorMsg}`);
    console.log(`[${ts()}] [${sessionId}] Workflow failed`);
    throw error;
  }
}

function startWorkflowExecution(
  workflow: WorkflowDefinition,
  options: any,
  workflowDir: string,
  cleanOldFiles: boolean,
  requestedSessionId?: string,
  startNodeId?: string,
  single?: boolean
) {
  const sessionId = requestedSessionId || uuidv4();
  const { executionStates, executions } = GLOBAL_CONTEXT;

  const isReusedSession = !!(requestedSessionId && executionStates.has(requestedSessionId));

  let state = executionStates.get(sessionId);

  if (!state) {
    state = {
      status: 'running',
      logs: [`Workflow started: ${sessionId}`],
      startTime: Date.now(),
      complete: false
    };
    executionStates.set(sessionId, state);
  } else if (!isReusedSession) {
    state.status = 'running';
    state.logs.push(`Workflow resumed: ${sessionId}`);
    state.startTime = Date.now();
    state.complete = false;
  }

  if (!isReusedSession) {
    const summary: SessionSummary = {
      id: sessionId,
      workflowName: workflow.name,
      status: 'running',
      startTime: state.startTime,
      nodeCount: workflow.nodes.length
    };
    GLOBAL_CONTEXT.sessionHistory.unshift(summary);
  }

  void runWorkflow(workflow, options, sessionId, workflowDir, cleanOldFiles, startNodeId, single)
    .then(async () => {
      if (isReusedSession) return;
      const currentState = executionStates.get(sessionId);
      if (currentState) {
        currentState.status = 'complete';
        currentState.complete = true;
      }
      const s = GLOBAL_CONTEXT.sessionHistory.find(s => s.id === sessionId);
      if (s) {
        s.status = 'complete';
        s.endTime = Date.now();
        const executor = executions.get(sessionId);
        if (executor) {
          s.nodeStatuses = {};
          for (const [nid, node] of executor.getNodes()) {
            s.nodeStatuses[nid] = node.status;
          }
        }
      }
      await GLOBAL_CONTEXT.saveSessions();
    })
    .catch(async (err) => {
      if (isReusedSession) return;
      const currentState = executionStates.get(sessionId);
      if (currentState) {
        currentState.status = 'error';
        currentState.error = err instanceof Error ? err.message : String(err);
        currentState.complete = true;
      }
      const s = GLOBAL_CONTEXT.sessionHistory.find(s => s.id === sessionId);
      if (s) {
        s.status = 'error';
        s.endTime = Date.now();
        const executor = executions.get(sessionId);
        if (executor) {
          s.nodeStatuses = {};
          for (const [nid, node] of executor.getNodes()) {
            s.nodeStatuses[nid] = node.status;
          }
        }
      }
      await GLOBAL_CONTEXT.saveSessions();
    });

  return sessionId;
}

program.parse();
