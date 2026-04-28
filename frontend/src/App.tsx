import { useState, useRef, useCallback } from 'react';
import { CssBaseline, ThemeProvider, Box, Typography, Paper } from '@mui/material';
import { api } from './api';
import { darkTheme } from './theme/darkTheme';
import { Layout } from './components/Layout';
import { SessionPanel } from './components/SessionPanel';
import { GraphPanel, GraphPanelRef } from './components/GraphPanel';
import { NodeDetail } from './components/NodeDetail';
import { ClaudeReport } from './components/ClaudeReport';
import { LoadingOverlay } from './components/LoadingOverlay';
import { useWorkflow } from './hooks/useWorkflow';
import { useSessionList } from './hooks/useSessionList';
import { useSessionPolling } from './hooks/useSessionPolling';
import type { NodeStatus, WorkflowDefinition } from './types/api';

export default function App() {
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [sessionPanelVisible, setSessionPanelVisible] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [expandedLoopNodeId, setExpandedLoopNodeId] = useState<string | null>(null);
  const [baseWorkflow, setBaseWorkflow] = useState<WorkflowDefinition | null>(null);
  const [claudeReport, setClaudeReport] = useState<{ nodeId: string; url: string } | null>(null);

  const { workflow, loading: workflowLoading, reload: reloadWorkflow } = useWorkflow(expandedLoopNodeId);
  const { sessions, reload: reloadSessions } = useSessionList();
  const graphRef = useRef<GraphPanelRef>(null);

  const handleNodeClick = useCallback((nodeId: string) => setSelectedNodeId(nodeId), []);

  const handleNodeStatusChange = useCallback((nodeId: string, status: NodeStatus) => {
    graphRef.current?.updateNodeStatus(nodeId, status);
  }, []);

  const { loading: pollingLoading } = useSessionPolling(currentSessionId, handleNodeStatusChange);

  const handleSelectSession = (sessionId: string) => {
    setCurrentSessionId(sessionId);
    if (sessionPanelVisible) reloadSessions();
  };

  const handleRerun = async (sessionId: string) => {
    try {
      const { sessionId: newId } = await api.rerunSession(sessionId);
      setCurrentSessionId(newId);
      reloadSessions();
    } catch (e) {
      console.error('Rerun failed:', e);
    }
  };

  const handleRun = async () => {
    try {
      const { sessionId } = await api.runSession();
      setCurrentSessionId(sessionId);
      reloadSessions();
    } catch (e) {
      console.error('Run failed:', e);
    }
  };

  const handleRunNode = async (nodeId?: string) => {
    const nid = nodeId || selectedNodeId;
    if (!nid) return;
    try {
      const { sessionId } = await api.runNode(nid, {
        sessionId: currentSessionId || undefined,
        single: true,
      });
      setCurrentSessionId(sessionId);
    } catch (e) {
      console.error('Run node failed:', e);
    }
  };

  const handleRefresh = () => {
    reloadWorkflow();
    reloadSessions();
  };

  const handleFitGraph = () => {
    graphRef.current?.fit();
  };

  const handleExpandLoop = async (nodeId: string) => {
    try {
      if (!baseWorkflow && workflow) {
        setBaseWorkflow(JSON.parse(JSON.stringify(workflow)));
      }
      setExpandedLoopNodeId(nodeId);
    } catch (e) {
      console.error('Expand loop failed:', e);
    }
  };

  // Find selected node definition
  const selectedNode = workflow?.nodes.find(n => n.id === selectedNodeId) || null;

  // Active session info
  const activeSession = sessions.find(s => s.id === currentSessionId);

  return (
    <ThemeProvider theme={darkTheme}>
      <CssBaseline />
      <LoadingOverlay visible={pollingLoading && !!currentSessionId} />

      <Layout
        sessionPanelVisible={sessionPanelVisible}
        runDisabled={!workflow}
        onRun={handleRun}
        onRunNode={() => handleRunNode()}
        onRefresh={handleRefresh}
        onFitGraph={handleFitGraph}
        onToggleSessionPanel={() => {
          setSessionPanelVisible(!sessionPanelVisible);
          if (!sessionPanelVisible) reloadSessions();
        }}
        sessionPanelContent={
          <SessionPanel
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelectSession={handleSelectSession}
            onRerun={handleRerun}
            onClose={() => setSessionPanelVisible(false)}
            onReload={reloadSessions}
          />
        }
        graphPanelContent={
          workflow && !workflowLoading ? (
            <GraphPanel
              ref={graphRef}
              workflow={workflow}
              onNodeClick={handleNodeClick}
              expandedLoopNodeId={expandedLoopNodeId}
              baseWorkflow={baseWorkflow}
            />
          ) : (
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#b8b8b8' }}>
              <Typography>{workflowLoading ? 'Loading workflow...' : 'No workflow loaded'}</Typography>
            </Box>
          )
        }
        sidebarContent={
          <>
            <Typography variant="h6" sx={{ mb: 2, pb: 1, borderBottom: '1px solid #505050' }}>
              Workflow: {workflow?.name || '-'}
            </Typography>

            {/* Active session info */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ color: '#b8b8b8', display: 'block', mb: 1 }}>Active Session</Typography>
              {currentSessionId ? (
                <>
                  <Typography variant="body2" sx={{ fontSize: 13 }}>
                    Session: {currentSessionId.slice(0, 8)}...
                  </Typography>
                  {activeSession && (
                    <Typography variant="caption" sx={{ color: '#b8b8b8' }}>
                      {activeSession.workflowName} &middot; {activeSession.status}
                    </Typography>
                  )}
                </>
              ) : (
                <Typography variant="body2" sx={{ fontSize: 13, color: '#b8b8b8' }}>-</Typography>
              )}
            </Box>

            {/* Node list */}
            <Box sx={{ mb: 2 }}>
              <Typography variant="caption" sx={{ color: '#b8b8b8', display: 'block', mb: 1 }}>Nodes</Typography>
              {workflow && (
                <NodeList
                  workflow={workflow}
                  baseWorkflow={baseWorkflow}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
                />
              )}
            </Box>

            {/* Node detail */}
            {selectedNode && currentSessionId && (
              <NodeDetail
                node={selectedNode}
                sessionId={currentSessionId}
                onRunNode={handleRunNode}
                onExpandLoop={handleExpandLoop}
                onShowClaudeReport={(nodeId, url) => setClaudeReport({ nodeId, url })}
              />
            )}

            {/* Collapse subgraph button */}
            {expandedLoopNodeId && (
              <Box sx={{ mt: 2 }}>
                <Typography
                  sx={{ fontSize: 11, color: '#f39c12', cursor: 'pointer' }}
                  onClick={() => {
                    setExpandedLoopNodeId(null);
                    setBaseWorkflow(null);
                  }}
                >
                  Collapse Subgraph
                </Typography>
              </Box>
            )}
          </>
        }
        claudeReportPanel={
          claudeReport ? (
            <ClaudeReport
              nodeId={claudeReport.nodeId}
              url={claudeReport.url}
              onClose={() => setClaudeReport(null)}
            />
          ) : undefined
        }
      />
    </ThemeProvider>
  );
}

function NodeList({
  workflow, baseWorkflow, selectedNodeId, onSelectNode,
}: {
  workflow: WorkflowDefinition;
  baseWorkflow: WorkflowDefinition | null;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}) {
  const connectedNodes = new Set<string>();
  for (const edge of workflow.edges) {
    connectedNodes.add(edge.from.nodeId);
    if (edge.condition?.branches) {
      for (const b of edge.condition.branches) connectedNodes.add(b.to.nodeId);
    } else if (edge.to) connectedNodes.add(edge.to.nodeId);
  }

  const baseNodeIds = baseWorkflow ? new Set(baseWorkflow.nodes.map(n => n.id)) : null;

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
      {workflow.nodes
        .filter(n => connectedNodes.has(n.id))
        .map(node => {
          const isSub = baseNodeIds ? !baseNodeIds.has(node.id) : false;
          const isSelected = node.id === selectedNodeId;
          return (
            <Paper
              key={node.id}
              sx={{
                p: 1.5,
                bgcolor: isSelected ? '#e94560' : '#0f3460',
                borderRadius: 2,
                cursor: 'pointer',
                transition: 'all 0.2s',
                '&:hover': { bgcolor: isSelected ? '#e94560' : '#e94560' },
              }}
              onClick={() => onSelectNode(node.id)}
            >
              <Typography variant="body2" sx={{ fontWeight: 'bold' }}>
                {node.name || node.id}
                {isSub && (
                  <Box component="span" sx={{
                    ml: 0.5, px: 0.75, py: 0.25, borderRadius: 0.5,
                    bgcolor: '#e67e22', color: '#fff', fontSize: 10,
                  }}>
                    sub
                  </Box>
                )}
              </Typography>
              <Typography variant="caption" sx={{ color: '#b8b8b8' }}>{node.type}</Typography>
            </Paper>
          );
        })}
    </Box>
  );
}
