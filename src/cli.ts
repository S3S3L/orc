#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowGraph } from './core/Graph.js';
import { Executor } from './core/Executor.js';
import type { WorkflowDefinition, ExecutionContext, ExecutionState } from './types.js';
import { GLOBAL_CONTEXT } from './utils/GlobalContext.js';

const program = new Command();

program
  .name('orc')
  .description('Orchestration Runner - JSON-driven task orchestration tool')
  .version('0.1.0');

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
      // Load workflow
      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      const workflow: WorkflowDefinition = JSON.parse(workflowContent);

      const workflowDir = path.dirname(path.resolve(workflowPath));
      const sessionId = options.sessionId;

      // Set execution state (shares the same state shape as serve)
      GLOBAL_CONTEXT.executionStates.set(sessionId, {
        status: 'running',
        logs: [],
        startTime: Date.now(),
        complete: false
      });

      // Execute workflow
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
    const http = await import('http');

    let workflowDir = process.cwd();
    if (workflowPath) {
      const workflowContent = await fs.readFile(workflowPath, 'utf-8');
      GLOBAL_CONTEXT.lastWorkflow = JSON.parse(workflowContent);
      workflowDir = path.resolve(path.dirname(workflowPath));
    }

    const { lastWorkflow, executionStates, executions } = GLOBAL_CONTEXT;

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

      // /api/run?sessionId=xxx POST
      if (url.pathname === '/api/run' && req.method === 'POST') {
        if (!lastWorkflow) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'No workflow loaded' }));
          return;
        }

        const sessionId = startWorkflowExecution(
          lastWorkflow,
          options,
          workflowDir,
          url.searchParams.get('cleanOldFiles') === 'true',  // Control cleanOldFiles via query param
          url.searchParams.get('sessionId') || undefined
        );

        res.end(JSON.stringify({ sessionId }));
        return;
      }

      if (url.pathname === '/api/node/run' && req.method === 'POST') {
        if (!lastWorkflow) {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: 'No workflow loaded' }));
          return;
        }

        const sessionId = startWorkflowExecution(
          lastWorkflow,
          options,
          workflowDir,
          url.searchParams.get('cleanOldFiles') === 'true',  // Control cleanOldFiles via query param
          url.searchParams.get('sessionId') || undefined,
          url.searchParams.get('nodeId') || undefined,
          url.searchParams.get('single') === 'true',  // Control single-node execution via query param
        );

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

        res.end(JSON.stringify({
          ...state,
          nodes: [...executions.get(sessionId)?.getNodes().values() || []].map((node) => node || null)  // Optionally return current node states
        }));
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

async function runWorkflow(
  workflow: WorkflowDefinition,
  options: any,
  sessionId: string,
  workflowDir: string,
  cleanOldFiles: boolean,
  startNodeId?: string,
  single?: boolean
) {
  // Initialize directories
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
    debug: {
      startNodeId,
      single
    },
    cleanOldFiles
  };

  const executor = new Executor(graph, context);
  executions.set(sessionId, executor);

  // Get state reference and ensure it exists
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

  const { executionStates } = GLOBAL_CONTEXT;

  let state = executionStates.get(sessionId);

  if (!state) {
    state = {
      status: 'running',
      logs: [`Workflow started: ${sessionId}`],
      startTime: Date.now(),
      complete: false
    };
    executionStates.set(sessionId, state);
  } else {
    state.status = 'running';
    state.logs.push(`Workflow resumed: ${sessionId}`);
    state.startTime = Date.now();
    state.complete = false;
  }

  void runWorkflow(workflow, options, sessionId, workflowDir, cleanOldFiles, startNodeId, single)
    .then(() => {
      const currentState = executionStates.get(sessionId);
      if (currentState) {
        currentState.status = 'complete';
        currentState.complete = true;
      }
    })
    .catch((err) => {
      const currentState = executionStates.get(sessionId);
      if (currentState) {
        currentState.status = 'error';
        currentState.error = err instanceof Error ? err.message : String(err);
        currentState.complete = true;
      }
    });

  return sessionId;
}

program.parse();
