import { describe, it, expect } from 'vitest';
import { workflowToElements, elementsToWorkflow, generateEdgeId } from './utils';
import type { WorkflowDefinition } from '../../types/api';

function mockWorkflow(overrides: Partial<WorkflowDefinition> = {}): WorkflowDefinition {
  return {
    version: '1.0',
    name: 'Test Workflow',
    nodes: [],
    edges: [],
    schemas: {},
    ...overrides,
  };
}

describe('workflowToElements', () => {
  it('converts nodes to cytoscape elements', () => {
    const wf = mockWorkflow({
      nodes: [
        { id: 'n1', type: 'bash', name: 'Step 1', config: {} },
        { id: 'n2', type: 'python', name: '', config: {} },
      ],
    });

    const elements = workflowToElements(wf);
    const nodes = elements.filter(e => !e.data?.source);

    expect(nodes).toHaveLength(2);
    expect(nodes[0].data.id).toBe('n1');
    expect(nodes[0].data.label).toBe('Step 1');
    expect(nodes[0].data.type).toBe('bash');
    // empty name falls back to id
    expect(nodes[1].data.label).toBe('n2');
  });

  it('converts simple edges', () => {
    const wf = mockWorkflow({
      edges: [
        { id: 'e1', from: { nodeId: 'n1' }, to: { nodeId: 'n2', input: 'result' } },
      ],
    });

    const elements = workflowToElements(wf);
    const edges = elements.filter(e => e.data?.source);

    expect(edges).toHaveLength(1);
    expect(edges[0].data.id).toBe('e1');
    expect(edges[0].data.source).toBe('n1');
    expect(edges[0].data.target).toBe('n2');
    expect(edges[0].data.label).toBe('result');
    expect(edges[0].data.isBranchEdge).toBeUndefined();
  });

  it('converts condition branch edges', () => {
    const wf = mockWorkflow({
      edges: [
        {
          id: 'ce1',
          from: { nodeId: 'n1' },
          to: { nodeId: 'n2', input: '' },
          condition: {
            branches: [
              { expression: "outputs['n1']?.status == 'success'", to: { nodeId: 'n2', input: 'ok' } },
              { expression: "outputs['n1']?.status == 'failed'", to: { nodeId: 'n3', input: 'err' } },
            ],
            onNoMatch: 'stop',
          },
        },
      ],
    });

    const elements = workflowToElements(wf);
    const edges = elements.filter(e => e.data?.source);

    expect(edges).toHaveLength(2);
    // Labels are sanitized for display
    expect(edges[0].data.label).toContain('status');
    expect(edges[0].data.isBranchEdge).toBe(true);
    expect(edges[0].data.parentEdgeId).toBe('ce1');
    expect(edges[1].data.id).toBe('ce1-branch-1');
  });

  it('handles empty workflow', () => {
    const elements = workflowToElements(mockWorkflow());
    expect(elements).toEqual([]);
  });
});

describe('elementsToWorkflow', () => {
  const baseWorkflow = mockWorkflow({
    nodes: [
      { id: 'n1', type: 'bash', name: 'Node 1', config: { script: 'test.sh' } },
      { id: 'n2', type: 'python', name: 'Node 2', config: { script: 'test.py' } },
    ],
  });

  it('preserves node definitions from base workflow', () => {
    const elements = [
      { data: { id: 'n1', label: 'Node 1', type: 'bash' } },
      { data: { id: 'n2', label: 'Node 2', type: 'python' } },
    ];

    const result = elementsToWorkflow(elements, baseWorkflow);
    expect(result.nodes).toHaveLength(2);
    expect(result.nodes[0].id).toBe('n1');
    expect(result.nodes[0].config.script).toBe('test.sh');
  });

  it('converts simple edges back', () => {
    const elements = [
      { data: { id: 'n1', label: 'Node 1', type: 'bash' } },
      { data: { id: 'n2', label: 'Node 2', type: 'python' } },
      { data: { id: 'e1', source: 'n1', target: 'n2', input: 'output' } },
    ];

    const result = elementsToWorkflow(elements, baseWorkflow);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].id).toBe('e1');
    expect(result.edges[0].from.nodeId).toBe('n1');
    expect(result.edges[0].to.nodeId).toBe('n2');
    expect(result.edges[0].to.input).toBe('output');
  });

  it('converts branch edges back to condition', () => {
    const elements = [
      { data: { id: 'n1', label: 'Node 1', type: 'bash' } },
      { data: { id: 'n2', label: 'Node 2', type: 'python' } },
      { data: { id: 'n3', label: 'Node 3', type: 'file' } },
      {
        data: {
          id: 'ce1-branch-0',
          source: 'n1',
          target: 'n2',
          label: "status == 'success'",
          input: 'ok',
          isBranchEdge: true,
          parentEdgeId: 'ce1',
        },
      },
      {
        data: {
          id: 'ce1-branch-1',
          source: 'n1',
          target: 'n3',
          label: "status == 'failed'",
          input: 'err',
          isBranchEdge: true,
          parentEdgeId: 'ce1',
        },
      },
    ];

    const result = elementsToWorkflow(elements, baseWorkflow);
    expect(result.edges).toHaveLength(1);
    expect(result.edges[0].id).toBe('ce1');
    expect(result.edges[0].condition).toBeDefined();
    expect(result.edges[0].condition!.branches).toHaveLength(2);
    expect(result.edges[0].condition!.branches[0].expression).toBe("status == 'success'");
    expect(result.edges[0].condition!.branches[0].to.nodeId).toBe('n2');
  });

  it('handles non-array elements gracefully', () => {
    const result = elementsToWorkflow(null as unknown as any, baseWorkflow);
    // null is not an array, so cyElements becomes [], no nodes/edges extracted from elements
    // but baseWorkflow nodes are not added back (elementsToWorkflow only extracts from elements)
    expect(result.nodes).toHaveLength(0);
    expect(result.edges).toHaveLength(0);
  });
});

describe('round-trip', () => {
  it('workflow -> elements -> workflow preserves structure', () => {
    const original: WorkflowDefinition = {
      version: '1.0',
      name: 'Round Trip',
      nodes: [
        { id: 'a', type: 'bash', name: 'A', config: { script: 'a.sh' } },
        { id: 'b', type: 'python', name: 'B', config: { script: 'b.py' } },
        { id: 'c', type: 'claude-code', name: 'C', config: { prompt: { markdown: 'test' } } },
      ],
      edges: [
        { id: 'e1', from: { nodeId: 'a' }, to: { nodeId: 'b', input: 'data' } },
      ],
      schemas: {},
    };

    const elements = workflowToElements(original);
    const restored = elementsToWorkflow(elements, original);

    expect(restored.nodes.map(n => n.id)).toEqual(['a', 'b', 'c']);
    expect(restored.edges).toHaveLength(1);
    expect(restored.edges[0].to.input).toBe('data');
    // Config preserved because nodes come from baseWorkflow
    expect(restored.nodes[0].config.script).toBe('a.sh');
    expect(restored.nodes[2].config.prompt.markdown).toBe('test');
  });
});

describe('generateEdgeId', () => {
  it('generates deterministic id from fromId and toId', () => {
    expect(generateEdgeId('a', 'b')).toBe('edge-a-to-b');
  });

  it('includes index suffix when provided', () => {
    expect(generateEdgeId('a', 'b', 1)).toBe('edge-a-to-b-1');
  });
});
