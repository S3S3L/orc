import { ReactNode, useState } from 'react';
import { Box, IconButton, Tooltip } from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import PlayCircleOutlineIcon from '@mui/icons-material/PlayCircleOutline';
import RefreshIcon from '@mui/icons-material/Refresh';
import FitScreenIcon from '@mui/icons-material/FitScreen';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import CloseIcon from '@mui/icons-material/Close';

interface LayoutProps {
  sessionPanelContent: ReactNode;
  graphPanelContent: ReactNode;
  sidebarContent: ReactNode;
  claudeReportPanel?: ReactNode;
  onRun: () => void;
  onRunNode: () => void;
  onRefresh: () => void;
  onFitGraph: () => void;
  onToggleSessionPanel: () => void;
  sessionPanelVisible: boolean;
  runDisabled?: boolean;
}

export function Layout({
  sessionPanelContent,
  graphPanelContent,
  sidebarContent,
  claudeReportPanel,
  onRun,
  onRunNode,
  onRefresh,
  onFitGraph,
  onToggleSessionPanel,
  sessionPanelVisible,
  runDisabled,
}: LayoutProps) {
  const [subgraphExpanded, setSubgraphExpanded] = useState(false);

  return (
    <Box sx={{ display: 'flex', height: '100vh', bgcolor: 'background.default' }}>
      {/* Session Panel */}
      {sessionPanelVisible && (
        <Box
          sx={{
            width: 380,
            bgcolor: '#1a2740',
            color: '#fff',
            overflowY: 'auto',
            flexShrink: 0,
          }}
        >
          {sessionPanelContent}
        </Box>
      )}

      {/* Graph Panel */}
      <Box sx={{ flex: 1, position: 'relative', overflow: 'hidden', bgcolor: '#1a1a2e' }}>
        {/* Toolbar */}
        <Box sx={{ position: 'absolute', top: 10, left: 10, zIndex: 1000, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Tooltip title="Run Workflow">
            <span>
              <IconButton
                onClick={onRun}
                disabled={runDisabled}
                sx={{ bgcolor: '#e94560', color: '#fff', '&:hover': { bgcolor: '#ff6b6b' }, '&.Mui-disabled': { bgcolor: '#8a8a8a', color: '#fff' } }}
              >
                <PlayArrowIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Run Node">
            <IconButton
              onClick={onRunNode}
              sx={{ bgcolor: '#0f3460', color: '#fff', '&:hover': { bgcolor: '#1a5276' } }}
            >
              <PlayCircleOutlineIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Refresh">
            <IconButton
              onClick={onRefresh}
              sx={{ bgcolor: '#0f3460', color: '#fff', '&:hover': { bgcolor: '#1a5276' } }}
            >
              <RefreshIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Fit Graph">
            <IconButton
              onClick={onFitGraph}
              sx={{ bgcolor: '#0f3460', color: '#fff', '&:hover': { bgcolor: '#1a5276' } }}
            >
              <FitScreenIcon />
            </IconButton>
          </Tooltip>
          {subgraphExpanded && (
            <Tooltip title="Collapse Subgraph">
              <IconButton
                onClick={() => setSubgraphExpanded(false)}
                sx={{ bgcolor: '#c0392b', color: '#fff', '&:hover': { bgcolor: '#a93226' } }}
              >
                <CloseIcon />
              </IconButton>
            </Tooltip>
          )}
          <Tooltip title={sessionPanelVisible ? 'Hide Sessions' : 'Sessions'}>
            <IconButton
              onClick={onToggleSessionPanel}
              sx={{ bgcolor: '#0f3460', color: '#fff', '&:hover': { bgcolor: '#1a5276' } }}
            >
              <FolderOpenIcon />
            </IconButton>
          </Tooltip>
        </Box>

        {graphPanelContent}
      </Box>

      {/* Claude Report Panel (replaces graph panel when active) */}
      {claudeReportPanel}

      {/* Right Sidebar */}
      <Box
        sx={{
          width: 500,
          minWidth: 500,
          flexShrink: 0,
          bgcolor: '#16213e',
          color: '#fff',
          overflowY: 'auto',
          p: 2,
        }}
      >
        {sidebarContent}
      </Box>
    </Box>
  );
}
