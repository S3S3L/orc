import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowGraph } from '../../core/Graph.js';
import { Executor } from '../../core/Executor.js';
import { GLOBAL_CONTEXT } from '../../utils/GlobalContext.js';
import type { ExecutionContext, ExecutionState, SessionSummary, WorkflowDefinition } from '../../types.js';

export interface ExecutionOptions {
  outputDir: string;
  auditDir: string;
  workspaceDir: string;
  workflowDir: string;
}

export async function runWorkflow(
  workflow: WorkflowDefinition,
  options: ExecutionOptions,
  sessionId: string,
  startNodeId?: string,
  single?: boolean,
  cleanOldFiles?: boolean
): Promise<void> {
  const { outputDir, auditDir, workspaceDir } = options;
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(auditDir, { recursive: true });
  await fs.mkdir(workspaceDir, { recursive: true });

  const { executionStates, executions } = GLOBAL_CONTEXT;
  const graph = new WorkflowGraph(workflow, options.workflowDir);

  const context: ExecutionContext = {
    workflowDef: workflow,
    workflowDir: options.workflowDir,
    outputDir,
    auditDir,
    tempBaseDir: workspaceDir,
    sessionId,
    nodeOutputs: new Map(),
    auditLog: [],
    debug: { startNodeId, single },
    cleanOldFiles: cleanOldFiles ?? false,
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
    if (state.logs) state.logs.push(`✗ Error: ${errorMsg}`);
    state.status = 'error';
    state.error = errorMsg;
    console.log(`[${ts()}] [${sessionId}] ✗ Error: ${errorMsg}`);
    throw error;
  }
}

export function startWorkflowExecution(
  workflow: WorkflowDefinition,
  options: ExecutionOptions,
  cleanOldFiles: boolean,
  requestedSessionId?: string,
  startNodeId?: string,
  single?: boolean
): string {
  const sessionId = requestedSessionId || uuidv4();
  const { executionStates } = GLOBAL_CONTEXT;
  const isReusedSession = !!(requestedSessionId && executionStates.has(requestedSessionId));

  let state = executionStates.get(sessionId);
  if (!state) {
    state = {
      status: 'running',
      logs: [`Workflow started: ${sessionId}`],
      startTime: Date.now(),
      complete: false,
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
      nodeCount: workflow.nodes.length,
    };
    GLOBAL_CONTEXT.sessionHistory.unshift(summary);
  }

  void runWorkflow(workflow, options, sessionId, startNodeId, single, cleanOldFiles)
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
        const executor = GLOBAL_CONTEXT.executions.get(sessionId);
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
        const executor = GLOBAL_CONTEXT.executions.get(sessionId);
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
