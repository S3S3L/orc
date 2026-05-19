import { useState } from 'react';
import {
  Box, Button, IconButton, TextField, Dialog, DialogTitle, DialogContent,
  DialogActions, Typography, Chip, List, ListItem, ListItemButton, ListItemText,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import SaveIcon from '@mui/icons-material/Save';
import AddIcon from '@mui/icons-material/Add';
import LinkIcon from '@mui/icons-material/Link';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import type { WorkflowDefinition, NodeDefinition, EdgeDefinition, WorkflowMeta } from '../types/api';
import { EditorGraphPanel } from './EditorGraphPanel';
import { PropertyPanel } from './PropertyPanel';
import { AddNodeMenu } from './AddNodeMenu';
import { generateNodeId, generateEdgeId } from '../editor/utils';

interface EditorLayoutProps {
  onBack: () => void;
  onSave: () => void;
  workflow: WorkflowDefinition | null;
  onWorkflowChange: (wf: WorkflowDefinition) => void;
  saving: boolean;
  workflowList: WorkflowMeta[];
  currentWorkflowId: string | null;
  onWorkflowSelect: (id: string) => void;
  onWorkflowCreate: (name: string) => void;
  onWorkflowDelete: (id: string) => void;
  onWorkflowCopy: (exampleId: string) => void;
}

export function EditorLayout({
  onBack, onSave, workflow, onWorkflowChange, saving,
  workflowList, currentWorkflowId, onWorkflowSelect,
  onWorkflowCreate, onWorkflowDelete, onWorkflowCopy,
}: EditorLayoutProps) {
  const [edgeMode, setEdgeMode] = useState(false);
  const [addMenuAnchor, setAddMenuAnchor] = useState<HTMLElement | null>(null);
  const [selectedNode, setSelectedNode] = useState<NodeDefinition | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const selectedEdge = selectedEdgeId
    ? workflow?.edges.find(e => e.id === selectedEdgeId || e.id.startsWith(selectedEdgeId.split('-branch-')[0])) || null
    : null;

  const handleAddNode = (type: string) => {
    if (!workflow) return;
    const id = `node-${generateNodeId().slice(0, 8)}`;
    const nodeDef: NodeDefinition = {
      id,
      type: type as NodeDefinition['type'],
      name: `${type} node`,
      config: {},
    };
    onWorkflowChange({ ...workflow, nodes: [...workflow.nodes, nodeDef] });
    setSelectedNode(nodeDef);
    setSelectedEdgeId(null);
  };

  const handleEdgeCreationTap = (sourceId: string, targetId: string) => {
    if (!workflow) return;
    const edgeId = generateEdgeId(sourceId, targetId);
    const edgeDef: EdgeDefinition = {
      id: edgeId,
      from: { nodeId: sourceId },
      to: { nodeId: targetId, input: '' },
    };
    onWorkflowChange({ ...workflow, edges: [...workflow.edges, edgeDef] });
    setEdgeMode(false);
  };

  const handleNodeChange = (node: NodeDefinition) => {
    if (!workflow) return;
    onWorkflowChange({
      ...workflow,
      nodes: workflow.nodes.map(n => n.id === node.id ? node : n),
    });
    setSelectedNode(node);
  };

  const handleNodeDelete = (nodeId: string) => {
    if (!workflow) return;
    onWorkflowChange({
      ...workflow,
      nodes: workflow.nodes.filter(n => n.id !== nodeId),
      edges: workflow.edges.filter(e => e.from.nodeId !== nodeId && e.to?.nodeId !== nodeId),
    });
    setSelectedNode(null);
  };

  const handleEdgeChange = (edge: EdgeDefinition) => {
    if (!workflow) return;
    onWorkflowChange({
      ...workflow,
      edges: workflow.edges.map(e => e.id === edge.id ? edge : e),
    });
    setSelectedEdgeId(edge.id);
  };

  const handleEdgeDelete = (edgeId: string) => {
    if (!workflow) return;
    onWorkflowChange({
      ...workflow,
      edges: workflow.edges.filter(e => e.id !== edgeId && !e.id.startsWith(edgeId.split('-branch-')[0])),
    });
    setSelectedEdgeId(null);
  };

  const readOnly = currentWorkflowId?.startsWith('example:');

  if (!workflow) {
    // Workflow picker screen
    const examples = workflowList.filter(w => w.readOnly);
    const workspaceWorkflows = workflowList.filter(w => !w.readOnly);

    return (
      <Box sx={{ height: '100vh', bgcolor: '#16213e', display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{
          p: 2, borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 2,
        }}>
          <IconButton onClick={onBack} size="small" sx={{ color: '#fff' }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" sx={{ color: '#fff' }}>Workflow Editor</Typography>
          <Button
            size="small"
            startIcon={<AddIcon />}
            onClick={() => setCreateDialogOpen(true)}
            sx={{ color: '#e94560' }}
          >
            New Workflow
          </Button>
        </Box>

        {/* Content */}
        <Box sx={{ flex: 1, overflow: 'auto', p: 3 }}>
          {workspaceWorkflows.length > 0 && (
            <>
              <Typography variant="caption" sx={{ color: '#b8b8b8', display: 'block', mb: 1 }}>
                Workspace Workflows
              </Typography>
              <List dense sx={{ mb: 3 }}>
                {workspaceWorkflows.map(wf => (
                  <ListItem key={wf.id} secondaryAction={
                    <IconButton edge="end" size="small" onClick={() => onWorkflowDelete(wf.id)} sx={{ color: '#e94560' }}>
                      <Typography variant="caption" sx={{ color: '#e94560' }}>Delete</Typography>
                    </IconButton>
                  }>
                    <ListItemButton onClick={() => onWorkflowSelect(wf.id)}>
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ color: '#fff' }}>{wf.name}</Typography>}
                        secondary={<Typography variant="caption" sx={{ color: '#b8b8b8' }}>{wf.id.slice(0, 8)}...</Typography>}
                      />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </>
          )}

          {examples.length > 0 && (
            <>
              <Typography variant="caption" sx={{ color: '#b8b8b8', display: 'block', mb: 1 }}>
                Examples (copy to edit)
              </Typography>
              <List dense>
                {examples.map(wf => (
                  <ListItem key={wf.id}>
                    <ListItemButton onClick={() => onWorkflowCopy(wf.id)} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                      <ListItemText
                        primary={<Typography variant="body2" sx={{ color: '#fff' }}>{wf.name}</Typography>}
                      />
                      <Chip label="Example" size="small" sx={{ height: 18, fontSize: 10, bgcolor: '#9b59b6', color: '#fff', ml: 1 }} />
                    </ListItemButton>
                  </ListItem>
                ))}
              </List>
            </>
          )}

          {workflowList.length === 0 && (
            <Typography variant="body2" sx={{ color: '#b8b8b8', textAlign: 'center', mt: 8 }}>
              No workflows found. Create a new one or copy from examples.
            </Typography>
          )}
        </Box>

        {/* New Workflow Dialog */}
        <Dialog open={createDialogOpen} onClose={() => setCreateDialogOpen(false)}
          PaperProps={{ sx: { bgcolor: '#1a1a2e', border: '1px solid #505050' } }}>
          <DialogTitle sx={{ color: '#fff' }}>New Workflow</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              size="small"
              label="Workflow Name"
              value={newWorkflowName}
              onChange={e => setNewWorkflowName(e.target.value)}
              sx={{ mt: 1 }}
              InputLabelProps={{ sx: { color: '#b8b8b8' } }}
              InputProps={{ sx: { color: '#fff' } }}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateDialogOpen(false)} sx={{ color: '#b8b8b8' }}>Cancel</Button>
            <Button onClick={() => {
              onWorkflowCreate(newWorkflowName || 'New Workflow');
              setNewWorkflowName('');
              setCreateDialogOpen(false);
            }} sx={{ color: '#e94560' }}>Create</Button>
          </DialogActions>
        </Dialog>
      </Box>
    );
  }

  // Editor with graph
  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: '#16213e' }}>
      {/* Toolbar */}
      <Box sx={{
        p: 1, borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: 1,
        bgcolor: '#0f0f23',
      }}>
        <IconButton onClick={onBack} size="small" sx={{ color: '#fff' }}>
          <ArrowBackIcon />
        </IconButton>

        <Typography variant="body2" sx={{ color: '#fff', fontWeight: 'bold', mr: 2 }}>
          {workflow.name}
        </Typography>

        <Button
          size="small"
          startIcon={<AddCircleOutlineIcon />}
          onClick={e => setAddMenuAnchor(e.currentTarget)}
          sx={{ color: '#2ecc71' }}
        >
          Add Node
        </Button>

        <Button
          size="small"
          startIcon={<LinkIcon />}
          onClick={() => setEdgeMode(!edgeMode)}
          sx={{
            color: edgeMode ? '#e94560' : '#3498db',
            bgcolor: edgeMode ? '#e9456022' : 'transparent',
          }}
        >
          {edgeMode ? 'Connecting...' : 'Add Edge'}
        </Button>

        <Box sx={{ flex: 1 }} />

        <Button
          size="small"
          variant="contained"
          startIcon={<SaveIcon />}
          onClick={onSave}
          disabled={saving || readOnly}
          sx={{
            bgcolor: '#e94560',
            '&:hover': { bgcolor: '#c0392b' },
            '&.Mui-disabled': { bgcolor: '#555', color: '#888' },
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </Box>

      {/* Main area */}
      <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Graph */}
        <Box sx={{ flex: 1, position: 'relative', bgcolor: '#1a1a2e' }}>
          <EditorGraphPanel
            workflow={workflow}
            onWorkflowChange={onWorkflowChange}
            onNodeSelect={n => { setSelectedNode(n); setSelectedEdgeId(null); }}
            onEdgeSelect={id => { setSelectedEdgeId(id); setSelectedNode(null); }}
            edgeCreationMode={edgeMode}
            onEdgeCreationTap={handleEdgeCreationTap}
          />
        </Box>

        {/* Property Panel (right sidebar) */}
        <Box sx={{
          width: 320, borderLeft: '1px solid #333', bgcolor: '#16213e', overflow: 'auto',
        }}>
          <PropertyPanel
            selectedNode={selectedNode}
            selectedEdge={selectedEdge}
            workflow={workflow}
            onNodeChange={handleNodeChange}
            onNodeDelete={handleNodeDelete}
            onEdgeChange={handleEdgeChange}
            onEdgeDelete={handleEdgeDelete}
          />
        </Box>
      </Box>

      <AddNodeMenu
        anchorEl={addMenuAnchor}
        onClose={() => setAddMenuAnchor(null)}
        onSelect={handleAddNode}
      />
    </Box>
  );
}
