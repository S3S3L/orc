import cytoscape from 'cytoscape';
import type { WorkflowDefinition, NodeDefinition, EdgeDefinition } from '../types/api';

export function workflowToElements(wf: WorkflowDefinition): cytoscape.ElementDefinition[] {
  const elements: cytoscape.ElementDefinition[] = [];

  for (const node of wf.nodes) {
    elements.push({
      data: {
        id: node.id,
        label: node.name || node.id,
        type: node.type,
      },
    });
  }

  for (const edge of wf.edges) {
    if (edge.condition?.branches) {
      edge.condition.branches.forEach((branch, idx) => {
        let label = branch.expression
          .replace(/outputs\['[^']+'\]\?\./g, '')
          .replace(/=== /g, '=')
          .replace(/!== /g, '!=')
          .replace(/ && /g, ' & ')
          .replace(/ \|\| /g, ' | ')
          .replace(/'/g, '');

        elements.push({
          data: {
            id: `${edge.id}-branch-${idx}`,
            source: edge.from.nodeId,
            target: branch.to.nodeId,
            label,
            input: branch.to.input,
            isBranchEdge: true,
            parentEdgeId: edge.id,
          },
        });
      });
    } else if (edge.to) {
      elements.push({
        data: {
          id: edge.id,
          source: edge.from.nodeId,
          target: edge.to.nodeId,
          label: edge.to.input,
          input: edge.to.input,
        },
      });
    }
  }

  return elements;
}

export function elementsToWorkflow(
  elements: cytoscape.ElementDefinition[],
  baseWorkflow: WorkflowDefinition,
): WorkflowDefinition {
  const nodeMap = new Map<string, NodeDefinition>();
  for (const node of baseWorkflow.nodes) {
    nodeMap.set(node.id, node);
  }

  const nodes: NodeDefinition[] = [];
  const edges: EdgeDefinition[] = [];

  const cyElements = Array.isArray(elements) ? elements : [];

  for (const el of cyElements) {
    if (!el.data) continue;

    const data = el.data as Record<string, unknown>;
    const isEdge = typeof data.source === 'string' && typeof data.target === 'string';

    if (!isEdge) {
      // It's a node
      const existing = nodeMap.get(el.data.id as string);
      if (existing) {
        nodes.push(existing);
      }
    } else {
      // It's an edge
      const edgeId = (data.parentEdgeId as string) || (data.id as string);
      if (data.isBranchEdge) {
        // Find or create the parent edge
        let parentEdge = edges.find(e => e.id === edgeId);
        if (!parentEdge) {
          parentEdge = {
            id: edgeId,
            from: { nodeId: data.source as string },
            to: { nodeId: data.target as string, input: (data.input as string) || '' },
            condition: { branches: [], onNoMatch: undefined },
          };
          edges.push(parentEdge);
        }
        parentEdge.condition!.branches.push({
          expression: (data.label as string) || '',
          to: { nodeId: data.target as string, input: (data.input as string) || '' },
        });
      } else {
        edges.push({
          id: edgeId,
          from: { nodeId: data.source as string },
          to: { nodeId: data.target as string, input: (data.input as string) || '' },
        });
      }
    }
  }

  return {
    ...baseWorkflow,
    nodes,
    edges,
  };
}

export function generateNodeId(): string {
  return crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateEdgeId(fromId: string, toId: string, index?: number): string {
  const base = `edge-${fromId}-to-${toId}`;
  return index ? `${base}-${index}` : base;
}
