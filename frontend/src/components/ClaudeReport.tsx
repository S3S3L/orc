import { Box, Button, Typography } from '@mui/material';
import OpenInNewIcon from '@mui/icons-material/OpenInNew';

interface ClaudeReportProps {
  nodeId: string;
  url: string;
  onClose: () => void;
}

export function ClaudeReport({ nodeId, url, onClose }: ClaudeReportProps) {
  return (
    <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', bgcolor: '#fff' }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        p: 1, bgcolor: '#16213e', borderBottom: '1px solid #505050', minHeight: 44,
      }}>
        <Typography variant="body2" sx={{ color: '#b8b8b8', fontSize: 13 }}>
          {nodeId} - Claude Code Report
        </Typography>
        <Box sx={{ display: 'flex', gap: 1 }}>
          <Button
            size="small"
            onClick={() => window.open(url, '_blank')}
            sx={{ bgcolor: '#e94560', color: '#fff', '&:hover': { bgcolor: '#ff6b6b' } }}
            startIcon={<OpenInNewIcon />}
          >
            View Full
          </Button>
          <Button size="small" onClick={onClose} sx={{ color: '#b8b8b8' }}>
            Close
          </Button>
        </Box>
      </Box>
      <iframe src={url} style={{ flex: 1, border: 'none', background: '#fff' }} />
    </Box>
  );
}
