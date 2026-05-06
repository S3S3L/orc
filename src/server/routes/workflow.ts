import { Router } from 'express';
import { GLOBAL_CONTEXT } from '../../utils/GlobalContext.js';
import type { WorkflowDefinition } from '../../types.js';

const router = Router();

function expandLoopSubgraph(workflow: WorkflowDefinition, loopNodeId: string) {
  const loopNode = workflow.nodes.find(n => n.id === loopNodeId);
  if (!loopNode || loopNode.type !== 'loop') return null;

  const loopConfig = loopNode.config as any;
  const subGraph = loopConfig?.subGraph;
  if (!subGraph) return null;

  const expandedNodes = workflow.nodes.filter(n => n.id !== loopNodeId);
  const subNodes = subGraph.nodes || [];
  const subEdges = subGraph.edges || [];
  const subRoots = subNodes.filter((n: any) => !subEdges.some((e: any) => e.to?.nodeId === n.id));

  const expandedEdges = workflow.edges
    .filter(e => e.from.nodeId !== loopNodeId)
    .map(e => {
      if (e.to?.nodeId === loopNodeId) {
        return { ...e, to: subRoots[0] ? { nodeId: subRoots[0].id, input: e.to.input } : undefined };
      }
      if (e.condition?.branches) {
        const newBranches = e.condition.branches.map(b => {
          if (b.to.nodeId === loopNodeId) {
            return subRoots[0] ? { ...b, to: { nodeId: subRoots[0].id, input: b.to.input } } : { ...b };
          }
          return b;
        });
        return { ...e, condition: { ...e.condition, branches: newBranches } };
      }
      return e;
    })
    .filter(Boolean);

  return { ...workflow, nodes: [...expandedNodes, ...subNodes], edges: [...expandedEdges, ...subEdges] };
}

// GET /api/v1/workflow
router.get('/workflow', (_req, res) => {
  const workflow = GLOBAL_CONTEXT.lastWorkflow;
  if (!workflow) {
    res.status(404).json({ error: 'No workflow loaded' });
    return;
  }
  res.json(workflow);
});

// GET /api/v1/workflow/expand?loopNodeId=xxx
router.get('/workflow/expand', (req, res) => {
  const workflow = GLOBAL_CONTEXT.lastWorkflow;
  if (!workflow) {
    res.status(404).json({ error: 'No workflow loaded' });
    return;
  }
  const loopNodeId = req.query.loopNodeId as string;
  if (!loopNodeId) {
    res.status(400).json({ error: 'Missing loopNodeId query parameter' });
    return;
  }
  const expanded = expandLoopSubgraph(workflow, loopNodeId);
  if (!expanded) {
    res.status(404).json({ error: `Loop node ${loopNodeId} not found or has no subGraph` });
    return;
  }
  res.json(expanded);
});

export default router;
