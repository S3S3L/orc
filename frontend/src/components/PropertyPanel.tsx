import { useState, useEffect } from 'react';
import {
  Box, Typography, TextField, Button, Chip, Divider,
} from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import type { NodeDefinition, WorkflowDefinition, EdgeDefinition } from '../types/api';
import { NodeConfigForm } from './NodeConfigForm';
import { nodeTypes } from './AddNodeMenu';

interface PropertyPanelProps {
  selectedNode: NodeDefinition | null;
  selectedEdge: EdgeDefinition | null;
  workflow: WorkflowDefinition;
  onNodeChange: (node: NodeDefinition) => void;
  onNodeDelete: (nodeId: string) => void;
  onEdgeChange: (edge: EdgeDefinition) => void;
  onEdgeDelete: (edgeId: string) => void;
}

export function PropertyPanel({
  selectedNode, selectedEdge, workflow,
  onNodeChange, onNodeDelete, onEdgeChange, onEdgeDelete,
}: PropertyPanelProps) {
  const [editingNode, setEditingNode] = useState<NodeDefinition | null>(selectedNode);
  const [editingEdge, setEditingEdge] = useState<EdgeDefinition | null>(selectedEdge);

  useEffect(() => {
    setEditingNode(selectedNode);
    setEditingEdge(selectedEdge);
  }, [selectedNode, selectedEdge]);

  if (!editingNode && !editingEdge) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="caption" sx={{ color: '#b8b8b8' }}>
          Click a node or edge to edit its properties
        </Typography>
      </Box>
    );
  }

  if (editingNode) {
    const nodeTypeInfo = nodeTypes.find(nt => nt.type === editingNode.type);

    return (
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#fff' }}>
            Node Properties
          </Typography>
          <Chip
            label={editingNode.type}
            size="small"
            sx={{
              bgcolor: nodeTypeInfo?.color || '#888',
              color: '#fff',
              fontSize: 11,
            }}
          />
        </Box>

        <TextField
          fullWidth
          size="small"
          label="ID"
          value={editingNode.id}
          onChange={e => onNodeChange({ ...editingNode, id: e.target.value })}
          sx={{ mb: 1 }}
          InputLabelProps={{ sx: { color: '#b8b8b8' } }}
          InputProps={{ sx: { color: '#fff', fontSize: 13, fontFamily: 'monospace' } }}
        />

        <TextField
          fullWidth
          size="small"
          label="Name"
          value={editingNode.name || ''}
          onChange={e => onNodeChange({ ...editingNode, name: e.target.value })}
          sx={{ mb: 1 }}
          InputLabelProps={{ sx: { color: '#b8b8b8' } }}
          InputProps={{ sx: { color: '#fff', fontSize: 13 } }}
        />

        <TextField
          fullWidth
          size="small"
          label="Description"
          value={editingNode.description || ''}
          onChange={e => onNodeChange({ ...editingNode, description: e.target.value })}
          sx={{ mb: 1 }}
          multiline
          rows={2}
          InputLabelProps={{ sx: { color: '#b8b8b8' } }}
          InputProps={{ sx: { color: '#fff', fontSize: 13 } }}
        />

        <Divider sx={{ my: 1, borderColor: '#333' }} />
        <Typography variant="caption" sx={{ color: '#b8b8b8', display: 'block', mb: 1 }}>
          Configuration
        </Typography>

        <NodeConfigForm
          nodeType={editingNode.type}
          config={editingNode.config || {}}
          onChange={config => onNodeChange({ ...editingNode, config })}
        />

        <Button
          fullWidth
          size="small"
          variant="outlined"
          startIcon={<DeleteOutlineIcon />}
          onClick={() => onNodeDelete(editingNode.id)}
          sx={{
            mt: 2,
            borderColor: '#e94560',
            color: '#e94560',
            '&:hover': { borderColor: '#e94560', bgcolor: '#e9456022' },
          }}
        >
          Delete Node
        </Button>
      </Box>
    );
  }

  if (editingEdge) {
    const sourceNode = workflow.nodes.find(n => n.id === editingEdge.from.nodeId);
    const targetNode = workflow.nodes.find(n => n.id === editingEdge.to?.nodeId);

    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" sx={{ fontWeight: 'bold', color: '#fff', mb: 2 }}>
          Edge Properties
        </Typography>

        <TextField
          fullWidth
          size="small"
          label="ID"
          value={editingEdge.id}
          onChange={e => onEdgeChange({ ...editingEdge, id: e.target.value })}
          sx={{ mb: 1 }}
          InputLabelProps={{ sx: { color: '#b8b8b8' } }}
          InputProps={{ sx: { color: '#fff', fontSize: 12, fontFamily: 'monospace' } }}
        />

        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" sx={{ color: '#b8b8b8' }}>From</Typography>
          <Typography variant="body2" sx={{ color: '#fff', fontSize: 13 }}>
            {sourceNode?.name || sourceNode?.id || editingEdge.from.nodeId}
          </Typography>
        </Box>

        <Box sx={{ mb: 1 }}>
          <Typography variant="caption" sx={{ color: '#b8b8b8' }}>To</Typography>
          <Typography variant="body2" sx={{ color: '#fff', fontSize: 13 }}>
            {targetNode?.name || targetNode?.id || editingEdge.to?.nodeId}
          </Typography>
        </Box>

        <TextField
          fullWidth
          size="small"
          label="Input Label"
          value={editingEdge.to?.input || ''}
          onChange={e => onEdgeChange({
            ...editingEdge,
            to: { ...editingEdge.to, nodeId: editingEdge.to?.nodeId || '', input: e.target.value },
          })}
          sx={{ mb: 1 }}
          InputLabelProps={{ sx: { color: '#b8b8b8' } }}
          InputProps={{ sx: { color: '#fff', fontSize: 13 } }}
        />

        <Button
          fullWidth
          size="small"
          variant="outlined"
          startIcon={<DeleteOutlineIcon />}
          onClick={() => onEdgeDelete(editingEdge.id)}
          sx={{
            mt: 2,
            borderColor: '#e94560',
            color: '#e94560',
            '&:hover': { borderColor: '#e94560', bgcolor: '#e9456022' },
          }}
        >
          Delete Edge
        </Button>
      </Box>
    );
  }

  return null;
}
