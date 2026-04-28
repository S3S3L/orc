import { Router } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { GLOBAL_CONTEXT } from '../../utils/GlobalContext.js';
import { startWorkflowExecution } from '../services/execution.js';

const router = Router();

function getExecutionOptions() {
  return {
    outputDir: GLOBAL_CONTEXT.outputDir!,
    auditDir: GLOBAL_CONTEXT.auditDir!,
    workspaceDir: GLOBAL_CONTEXT.workspaceDir!,
    workflowDir: GLOBAL_CONTEXT.workflowDir!,
  };
}

// GET /api/v1/sessions
router.get('/sessions', (_req, res) => {
  res.json(GLOBAL_CONTEXT.sessionHistory);
});

// POST /api/v1/sessions - Start a new workflow run
router.post('/sessions', (req, res) => {
  const workflow = GLOBAL_CONTEXT.lastWorkflow;
  if (!workflow) {
    res.status(404).json({ error: 'No workflow loaded' });
    return;
  }
  const sessionId = startWorkflowExecution(
    workflow,
    getExecutionOptions(),
    req.query.cleanOldFiles === 'true',
    (req.query.sessionId as string) || undefined,
  );
  res.json({ sessionId });
});

// POST /api/v1/sessions/:sessionId/rerun
router.post('/sessions/:sessionId/rerun', async (req, res) => {
  const workflow = GLOBAL_CONTEXT.lastWorkflow;
  if (!workflow) {
    res.status(404).json({ error: 'No workflow loaded' });
    return;
  }
  const oldSessionId = req.params.sessionId;
  if (oldSessionId) {
    try {
      await fs.rm(path.join(GLOBAL_CONTEXT.outputDir!, oldSessionId), { recursive: true, force: true });
    } catch { /* ignore */ }
  }
  const sessionId = startWorkflowExecution(workflow, getExecutionOptions(), true);
  res.json({ sessionId });
});

// GET /api/v1/sessions/:sessionId/status
router.get('/sessions/:sessionId/status', (req, res) => {
  const sessionId = req.params.sessionId;
  const activeState = GLOBAL_CONTEXT.executionStates.get(sessionId);
  if (activeState) {
    const executor = GLOBAL_CONTEXT.executions.get(sessionId);
    res.json({
      ...activeState,
      nodes: [...(executor?.getNodes().values() || [])].map(n => ({
        definition: n.definition,
        status: n.status,
      })),
    });
    return;
  }
  const session = GLOBAL_CONTEXT.sessionHistory.find(s => s.id === sessionId);
  if (session) {
    res.json({
      status: session.status,
      nodeStatuses: session.nodeStatuses || null,
      startTime: session.startTime,
      endTime: session.endTime,
    });
    return;
  }
  res.status(404).json({ error: 'Session not found' });
});

export default router;
