import { Router } from 'express';
import * as path from 'path';
import * as fs from 'fs/promises';
import { GLOBAL_CONTEXT } from '../../utils/GlobalContext.js';
import { startWorkflowExecution } from '../services/execution.js';
import { getNodeDetail, getNodeClaudeHtml } from '../services/nodeDetail.js';

const router = Router();

// GET /api/v1/nodes/:nodeId
router.get('/:nodeId', async (req, res) => {
  const nodeId = req.params.nodeId;
  const sessionId = (req.query.sessionId as string) || '';
  const workflow = GLOBAL_CONTEXT.lastWorkflow;

  if (!workflow) {
    res.status(404).json({ error: 'No workflow loaded' });
    return;
  }
  if (!GLOBAL_CONTEXT.outputDir || !GLOBAL_CONTEXT.auditDir) {
    res.status(500).json({ error: 'Directory paths not configured' });
    return;
  }

  try {
    const detail = await getNodeDetail(nodeId, sessionId, workflow);
    res.json(detail);
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : 'Node not found' });
  }
});

// POST /api/v1/nodes/:nodeId/run
router.post('/:nodeId/run', async (req, res) => {
  const workflow = GLOBAL_CONTEXT.lastWorkflow;
  if (!workflow) {
    res.status(404).json({ error: 'No workflow loaded' });
    return;
  }
  const nodeId = req.params.nodeId;
  const sessionId = (req.query.sessionId as string) || undefined;
  const isSingle = req.query.single === 'true';

  if (isSingle && nodeId && sessionId) {
    try {
      await fs.rm(path.join(GLOBAL_CONTEXT.outputDir!, sessionId, `${nodeId}.json`), { force: true });
    } catch { /* ignore */ }
  }

  const newSessionId = startWorkflowExecution(
    workflow,
    {
      outputDir: GLOBAL_CONTEXT.outputDir!,
      auditDir: GLOBAL_CONTEXT.auditDir!,
      workspaceDir: GLOBAL_CONTEXT.workspaceDir!,
      workflowDir: process.cwd(),
    },
    false,
    sessionId,
    nodeId,
    isSingle,
  );
  res.json({ sessionId: newSessionId });
});

// GET /api/v1/nodes/:nodeId/claude-html
router.get('/:nodeId/claude-html', async (req, res) => {
  const nodeId = req.params.nodeId;
  const sessionId = (req.query.sessionId as string) || '';

  if (!GLOBAL_CONTEXT.outputDir) {
    res.status(500).json({ error: 'Output directory not configured' });
    return;
  }

  try {
    const html = await getNodeClaudeHtml(nodeId, sessionId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(html);
  } catch (e) {
    res.status(404).json({ error: e instanceof Error ? e.message : 'HTML export not found' });
  }
});

export default router;
