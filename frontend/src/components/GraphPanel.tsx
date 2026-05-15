import { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import cytoscape from 'cytoscape';
import type { WorkflowDefinition, NodeStatus } from '../types/api';
import { nodeColors, statusColors } from '../theme/darkTheme';

interface GraphPanelProps {
  workflow: WorkflowDefinition;
  onNodeClick: (nodeId: string) => void;
  expandedLoopNodeId: string | null;
  baseWorkflow: WorkflowDefinition | null;
}

export interface GraphPanelRef {
  updateNodeStatus: (nodeId: string, status: NodeStatus) => void;
  fit: () => void;
  cy: cytoscape.Core | null;
}

export const GraphPanel = forwardRef<GraphPanelRef, GraphPanelProps>(({
  workflow, onNodeClick, expandedLoopNodeId, baseWorkflow,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useImperativeHandle(ref, () => ({
    updateNodeStatus: (nodeId: string, status: NodeStatus) => {
      const cy = cyRef.current;
      if (!cy) return;
      const node = cy.getElementById(nodeId);
      if (!node) return;

      node.data('status', status);
      cy.style().update();
    },
    fit: () => cyRef.current?.fit(),
    cy: cyRef.current,
  }));

  useEffect(() => {
    if (!containerRef.current || !workflow) return;

    // Build elements
    const elements: cytoscape.ElementDefinition[] = [];
    const connectedNodes = new Set<string>();

    for (const edge of workflow.edges) {
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
              isBranchEdge: true,
            },
          });
          connectedNodes.add(edge.from.nodeId);
          connectedNodes.add(branch.to.nodeId);
        });
      } else if (edge.to) {
        elements.push({
          data: {
            id: edge.id,
            source: edge.from.nodeId,
            target: edge.to.nodeId,
            label: edge.to.input,
          },
        });
        connectedNodes.add(edge.from.nodeId);
        connectedNodes.add(edge.to.nodeId);
      }
    }

    const baseNodeIds = expandedLoopNodeId && baseWorkflow
      ? new Set(baseWorkflow.nodes.map(n => n.id))
      : null;

    for (const node of workflow.nodes) {
      if (connectedNodes.has(node.id)) {
        const isSubNode = baseNodeIds ? !baseNodeIds.has(node.id) : false;
        elements.push({
          data: {
            id: node.id,
            label: node.name || node.id,
            type: node.type,
            status: 'pending',
            isSubgraphNode: isSubNode,
          },
        });
      }
    }

    // Build stylesheet - order matters for cascade priority
    // Status-based rules come AFTER type-based rules so they override
    const styleRules: cytoscape.StylesheetStyle[] = [
      // Base node style
      {
        selector: 'node',
        style: {
          label: 'data(label)',
          color: '#fff',
          'text-valign': 'center',
          'text-halign': 'center',
          width: 120,
          height: 60,
          'font-size': '12px',
          'font-weight': 'bold',
        },
      },
      // Type-based colors (lower priority than status)
      ...Object.entries(nodeColors).map(([type, color]) => ({
        selector: `node[type="${type}"]`,
        style: {
          'background-color': color,
          'border-color': '#fff',
          'border-width': 2,
        },
      })),
      // Loop node style
      {
        selector: 'node[type="loop"]',
        style: { 'border-style': 'dashed' },
      },
      // Subgraph node style
      {
        selector: 'node[isSubgraphNode="true"]',
        style: {
          'border-style': 'dashed',
          'border-width': 3,
          'border-color': '#f39c12',
          'background-opacity': 0.8,
        },
      },
      // Status-based overrides (higher priority - comes after type rules)
      {
        selector: 'node[status="success"]',
        style: {
          'background-color': statusColors.success,
          'border-color': '#fff',
          'border-width': 2,
        },
      },
      {
        selector: 'node[status="failed"]',
        style: {
          'background-color': statusColors.failed,
          'border-color': '#e74c3c',
          'border-width': 3,
        },
      },
      {
        selector: 'node[status="running"]',
        style: {
          'background-color': (ele: any) => nodeColors[ele.data('type')] || '#888',
          'border-color': '#f1c40f',
          'border-width': 4,
        },
      },
      {
        selector: 'node[status="skipped"]',
        style: {
          'background-color': statusColors.skipped,
          'border-color': '#8e44ad',
          'border-width': 3,
        },
      },
      // Edge styles
      {
        selector: 'edge',
        style: {
          width: 2,
          'line-color': '#8a8a8a',
          'target-arrow-color': '#8a8a8a',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          label: 'data(label)',
          'font-size': '10px',
          color: '#b8b8b8',
        },
      },
      {
        selector: 'edge[isBranchEdge="true"]',
        style: {
          'line-color': '#3498db',
          'target-arrow-color': '#3498db',
          width: 2,
        },
      },
    ];

    // Initialize cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: styleRules,
      layout: { name: 'breadthfirst', directed: true, padding: 50, spacingFactor: 1.5 },
    });

    cy.on('tap', 'node', (evt) => {
      onNodeClick(evt.target.data('id'));
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [workflow, onNodeClick, expandedLoopNodeId, baseWorkflow]);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
  );
});

GraphPanel.displayName = 'GraphPanel';
