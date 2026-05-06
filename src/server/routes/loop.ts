import { Router } from 'express';
import { GLOBAL_CONTEXT } from '../../utils/GlobalContext.js';

const router = Router();

// GET /api/v1/loops/:nodeId/subgraph
router.get('/:nodeId/subgraph', (req, res) => {
  const nodeId = req.params.nodeId;
  const workflow = GLOBAL_CONTEXT.lastWorkflow;
  if (!workflow) {
    res.status(404).json({ error: 'No workflow loaded' });
    return;
  }
  const loopNode = workflow.nodes.find(n => n.id === nodeId);
  if (!loopNode) {
    res.status(404).json({ error: `Node ${nodeId} not found` });
    return;
  }
  if (loopNode.type !== 'loop') {
    res.status(400).json({ error: `Node ${nodeId} is not a loop node` });
    return;
  }
  const loopConfig = loopNode.config as any;
  const subGraph = loopConfig?.subGraph;
  if (!subGraph) {
    res.status(404).json({ error: `Node ${nodeId} has no subGraph` });
    return;
  }
  res.json({
    nodeId,
    subGraph: {
      nodes: subGraph.nodes || [],
      edges: subGraph.edges || [],
      schemas: subGraph.schemas || {},
    },
    maxAttempts: loopConfig.maxAttempts,
    validator: loopConfig.validator,
  });
});

export default router;
