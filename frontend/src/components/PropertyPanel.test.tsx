import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PropertyPanel } from './PropertyPanel';
import type { NodeDefinition, WorkflowDefinition, EdgeDefinition } from '../types/api';

const mockWorkflow: WorkflowDefinition = {
  version: '1.0',
  name: 'Test',
  nodes: [
    { id: 'n1', type: 'bash', name: 'Node 1', config: {} },
    { id: 'n2', type: 'python', name: 'Node 2', config: {} },
  ],
  edges: [],
  schemas: {},
};

const mockNode: NodeDefinition = {
  id: 'n1',
  type: 'bash',
  name: 'Node 1',
  description: 'A test node',
  config: { script: 'test.sh' },
};

const mockEdge: EdgeDefinition = {
  id: 'e1',
  from: { nodeId: 'n1' },
  to: { nodeId: 'n2', input: 'data' },
};

describe('PropertyPanel', () => {
  it('shows placeholder when nothing is selected', () => {
    render(
      <PropertyPanel
        selectedNode={null}
        selectedEdge={null}
        workflow={mockWorkflow}
        onNodeChange={vi.fn()}
        onNodeDelete={vi.fn()}
        onEdgeChange={vi.fn()}
        onEdgeDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Click a node or edge to edit its properties')).toBeInTheDocument();
  });

  it('shows node properties when a node is selected', () => {
    render(
      <PropertyPanel
        selectedNode={mockNode}
        selectedEdge={null}
        workflow={mockWorkflow}
        onNodeChange={vi.fn()}
        onNodeDelete={vi.fn()}
        onEdgeChange={vi.fn()}
        onEdgeDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Node Properties')).toBeInTheDocument();
    expect(screen.getByText('bash')).toBeInTheDocument();
    expect(screen.getByDisplayValue('n1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Node 1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('A test node')).toBeInTheDocument();
    expect(screen.getByText('Delete Node')).toBeInTheDocument();
  });

  it('calls onNodeChange when name field changes', () => {
    const onNodeChange = vi.fn();
    render(
      <PropertyPanel
        selectedNode={mockNode}
        selectedEdge={null}
        workflow={mockWorkflow}
        onNodeChange={onNodeChange}
        onNodeDelete={vi.fn()}
        onEdgeChange={vi.fn()}
        onEdgeDelete={vi.fn()}
      />
    );

    const nameInput = screen.getByLabelText('Name');
    fireEvent.change(nameInput, { target: { value: 'Updated Name' } });

    expect(onNodeChange).toHaveBeenCalledWith({ ...mockNode, name: 'Updated Name' });
  });

  it('calls onNodeChange when description field changes', () => {
    const onNodeChange = vi.fn();
    render(
      <PropertyPanel
        selectedNode={mockNode}
        selectedEdge={null}
        workflow={mockWorkflow}
        onNodeChange={onNodeChange}
        onNodeDelete={vi.fn()}
        onEdgeChange={vi.fn()}
        onEdgeDelete={vi.fn()}
      />
    );

    const descInput = screen.getByLabelText('Description');
    fireEvent.change(descInput, { target: { value: 'New description' } });

    expect(onNodeChange).toHaveBeenCalledWith({ ...mockNode, description: 'New description' });
  });

  it('calls onNodeDelete when delete button is clicked', () => {
    const onNodeDelete = vi.fn();
    render(
      <PropertyPanel
        selectedNode={mockNode}
        selectedEdge={null}
        workflow={mockWorkflow}
        onNodeChange={vi.fn()}
        onNodeDelete={onNodeDelete}
        onEdgeChange={vi.fn()}
        onEdgeDelete={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('Delete Node'));
    expect(onNodeDelete).toHaveBeenCalledWith('n1');
  });

  it('renders NodeConfigForm for selected node', () => {
    render(
      <PropertyPanel
        selectedNode={mockNode}
        selectedEdge={null}
        workflow={mockWorkflow}
        onNodeChange={vi.fn()}
        onNodeDelete={vi.fn()}
        onEdgeChange={vi.fn()}
        onEdgeDelete={vi.fn()}
      />
    );

    expect(screen.getByLabelText('Script Path')).toBeInTheDocument();
  });

  it('shows edge properties when an edge is selected', () => {
    render(
      <PropertyPanel
        selectedNode={null}
        selectedEdge={mockEdge}
        workflow={mockWorkflow}
        onNodeChange={vi.fn()}
        onNodeDelete={vi.fn()}
        onEdgeChange={vi.fn()}
        onEdgeDelete={vi.fn()}
      />
    );

    expect(screen.getByText('Edge Properties')).toBeInTheDocument();
    expect(screen.getByText('From')).toBeInTheDocument();
    expect(screen.getByText('To')).toBeInTheDocument();
    expect(screen.getByText('Node 1')).toBeInTheDocument();
    expect(screen.getByText('Node 2')).toBeInTheDocument();
    expect(screen.getByDisplayValue('e1')).toBeInTheDocument();
    expect(screen.getByDisplayValue('data')).toBeInTheDocument();
    expect(screen.getByText('Delete Edge')).toBeInTheDocument();
  });

  it('calls onEdgeChange when input label changes', () => {
    const onEdgeChange = vi.fn();
    render(
      <PropertyPanel
        selectedNode={null}
        selectedEdge={mockEdge}
        workflow={mockWorkflow}
        onNodeChange={vi.fn()}
        onNodeDelete={vi.fn()}
        onEdgeChange={onEdgeChange}
        onEdgeDelete={vi.fn()}
      />
    );

    const inputLabel = screen.getByLabelText('Input Label');
    fireEvent.change(inputLabel, { target: { value: 'new-label' } });

    expect(onEdgeChange).toHaveBeenCalledWith({
      ...mockEdge,
      to: { ...mockEdge.to, nodeId: 'n2', input: 'new-label' },
    });
  });

  it('calls onEdgeDelete when delete button is clicked', () => {
    const onEdgeDelete = vi.fn();
    render(
      <PropertyPanel
        selectedNode={null}
        selectedEdge={mockEdge}
        workflow={mockWorkflow}
        onNodeChange={vi.fn()}
        onNodeDelete={vi.fn()}
        onEdgeChange={vi.fn()}
        onEdgeDelete={onEdgeDelete}
      />
    );

    fireEvent.click(screen.getByText('Delete Edge'));
    expect(onEdgeDelete).toHaveBeenCalledWith('e1');
  });

  it('shows node ID fallback when edge source node not in workflow', () => {
    const edgeWithMissingSource: EdgeDefinition = {
      id: 'e2',
      from: { nodeId: 'missing-node' },
      to: { nodeId: 'n1', input: '' },
    };

    render(
      <PropertyPanel
        selectedNode={null}
        selectedEdge={edgeWithMissingSource}
        workflow={mockWorkflow}
        onNodeChange={vi.fn()}
        onNodeDelete={vi.fn()}
        onEdgeChange={vi.fn()}
        onEdgeDelete={vi.fn()}
      />
    );

    expect(screen.getByText('missing-node')).toBeInTheDocument();
  });
});
