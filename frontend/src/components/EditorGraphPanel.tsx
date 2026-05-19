import { useEffect, useRef, useCallback } from 'react';
import cytoscape from 'cytoscape';
import type { WorkflowDefinition, NodeDefinition } from '../types/api';
import { nodeColors } from '../theme/darkTheme';
import { workflowToElements } from '../editor/utils';

interface EditorGraphPanelProps {
  workflow: WorkflowDefinition;
  onWorkflowChange: (wf: WorkflowDefinition) => void;
  onNodeSelect: (node: NodeDefinition | null) => void;
  onEdgeSelect: (edgeId: string | null) => void;
  edgeCreationMode: boolean;
  onEdgeCreationTap?: (sourceId: string, targetId: string) => void;
}

export function EditorGraphPanel({
  workflow, onWorkflowChange, onNodeSelect, onEdgeSelect,
  edgeCreationMode, onEdgeCreationTap,
}: EditorGraphPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);
  const workflowRef = useRef(workflow);
  const pendingSourceRef = useRef<string | null>(null);
  const edgeCreationModeRef = useRef(edgeCreationMode);

  workflowRef.current = workflow;
  edgeCreationModeRef.current = edgeCreationMode;

  // Sync cytoscape graph when workflow changes (incremental update, no destroy)
  const syncGraph = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const currentIds = new Set(cy.nodes().map(n => n.id()));
    const desiredIds = new Set(workflowRef.current.nodes.map(n => n.id));

    // Remove nodes that no longer exist
    const toRemove = [...currentIds].filter(id => !desiredIds.has(id));
    if (toRemove.length > 0) {
      cy.remove(cy.nodes().filter(n => toRemove.includes(n.id())));
    }

    // Add new nodes
    for (const node of workflowRef.current.nodes) {
      if (!cy.getElementById(node.id).length) {
        cy.add({
          group: 'nodes',
          data: { id: node.id, label: node.name || node.id, type: node.type },
        });
      }
    }

    // Remove edges that no longer exist
    const currentEdgeIds = new Set(cy.edges().map(e => e.id()));
    const desiredEdgeIds = new Set<string>();
    for (const edge of workflowRef.current.edges) {
      desiredEdgeIds.add(edge.id);
      if (edge.condition?.branches) {
        edge.condition.branches.forEach((_, idx) => {
          desiredEdgeIds.add(`${edge.id}-branch-${idx}`);
        });
      }
    }
    const edgesToRemove = [...currentEdgeIds].filter(id => !desiredEdgeIds.has(id));
    if (edgesToRemove.length > 0) {
      cy.remove(cy.edges().filter(e => edgesToRemove.includes(e.id())));
    }

    // Add new edges
    const elements = workflowToElements(workflowRef.current);
    for (const el of elements) {
      if (el.data && typeof (el.data as Record<string, unknown>).source === 'string') {
        if (!cy.getElementById(el.data.id as string).length) {
          cy.add(el);
        }
      }
    }

    // Re-layout
    cy.layout({ name: 'breadthfirst', directed: true, padding: 50, spacingFactor: 1.5 }).run();
  }, []);

  // Initialize cytoscape once on mount
  useEffect(() => {
    if (!containerRef.current || !workflow) return;

    const elements = workflowToElements(workflow);

    const styleRules: cytoscape.StylesheetStyle[] = [
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
      ...Object.entries(nodeColors).map(([type, color]) => ({
        selector: `node[type="${type}"]`,
        style: {
          'background-color': color,
          'border-color': '#fff',
          'border-width': 2,
        },
      })),
      {
        selector: 'node[type="loop"]',
        style: { 'border-style': 'dashed' },
      },
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
      {
        selector: ':selected',
        style: {
          'border-width': 4,
          'border-color': '#e94560',
        },
      },
      {
        selector: 'edge:selected',
        style: {
          width: 4,
          'line-color': '#e94560',
          'target-arrow-color': '#e94560',
        },
      },
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: styleRules,
      layout: { name: 'breadthfirst', directed: true, padding: 50, spacingFactor: 1.5 },
      autoungrabify: false,
      boxSelectionEnabled: true,
      selectionType: 'single',
    });

    cyRef.current = cy;

    cy.on('tap', 'node', (evt) => {
      const nodeId = evt.target.data('id');
      if (edgeCreationModeRef.current) {
        if (!pendingSourceRef.current) {
          pendingSourceRef.current = nodeId;
          evt.target.style('border-color', '#e94560');
        } else {
          const sourceId = pendingSourceRef.current;
          pendingSourceRef.current = null;
          if (sourceId !== nodeId) {
            onEdgeCreationTap?.(sourceId, nodeId);
          }
        }
        return;
      }

      const node = workflowRef.current.nodes.find(n => n.id === nodeId);
      onNodeSelect(node || null);
      onEdgeSelect(null);
    });

    cy.on('tap', 'edge', (evt) => {
      if (edgeCreationModeRef.current) return;
      const edgeId = evt.target.data('id');
      onEdgeSelect(edgeId);
      onNodeSelect(null);
    });

    cy.on('tap', (evt) => {
      if (evt.target === cy) {
        onNodeSelect(null);
        onEdgeSelect(null);
        if (edgeCreationModeRef.current && pendingSourceRef.current) {
          pendingSourceRef.current = null;
          cy.elements().style('border-color', '#fff');
        }
      }
    });

    cy.on('cxttap', 'edge', (evt) => {
      const edgeId = evt.target.data('id');
      if (confirm('Delete this edge?')) {
        const wf = workflowRef.current;
        const parentEdgeId = edgeId.includes('-branch-')
          ? edgeId.split('-branch-')[0]
          : edgeId;
        onWorkflowChange({
          ...wf,
          edges: wf.edges.filter(e => e.id !== edgeId && e.id !== parentEdgeId),
        });
        evt.target.remove();
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const active = document.activeElement;
        if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') return;

        const selected = cy.$(':selected');
        if (selected.length === 0) return;

        const nodeIds = selected.filter('node').map(n => n.id());
        const edgeIds = selected.filter('edge').map(e => e.id());

        if (nodeIds.length > 0) {
          const wf = workflowRef.current;
          onWorkflowChange({
            ...wf,
            nodes: wf.nodes.filter(n => !nodeIds.includes(n.id)),
            edges: wf.edges.filter(e => !nodeIds.includes(e.from.nodeId) && e.to?.nodeId && !nodeIds.includes(e.to.nodeId)),
          });
          selected.remove();
          onNodeSelect(null);
        } else if (edgeIds.length > 0) {
          const wf = workflowRef.current;
          const allEdgeIds = new Set<string>(edgeIds);
          edgeIds.forEach(eid => {
            if (eid.includes('-branch-')) allEdgeIds.add(eid.split('-branch-')[0]);
          });
          onWorkflowChange({
            ...wf,
            edges: wf.edges.filter(e => !allEdgeIds.has(e.id)),
          });
          selected.remove();
          onEdgeSelect(null);
        }
      }

      if (e.key === 'Escape' && edgeCreationModeRef.current && pendingSourceRef.current) {
        pendingSourceRef.current = null;
        cy.elements().style('border-color', '#fff');
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      cy.destroy();
      cyRef.current = null;
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []); // Only on mount

  // Sync graph when workflow changes (no re-init)
  useEffect(() => {
    if (cyRef.current) {
      syncGraph();
    }
  }, [workflow, syncGraph]);

  // Update edgeCreationMode ref for event handlers (no re-subscription needed)

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      {edgeCreationMode && (
        <div style={{
          position: 'absolute', top: 50, left: '50%', transform: 'translateX(-50%)',
          background: '#e94560', color: '#fff', padding: '4px 16px', borderRadius: 4,
          fontSize: 12, zIndex: 2000, pointerEvents: 'none',
        }}>
          {pendingSourceRef.current ? 'Click target node' : 'Click source node'}
          <span style={{ marginLeft: 8, cursor: 'pointer' }} onClick={() => {
            pendingSourceRef.current = null;
          }}>[cancel]</span>
        </div>
      )}
    </div>
  );
}
