import { useState } from 'react';
import {
  Box, Typography, List, ListItem, ListItemButton, ListItemText,
  Chip, Button, IconButton,
} from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import ReplayIcon from '@mui/icons-material/Replay';
import CloseIcon from '@mui/icons-material/Close';
import type { SessionSummary } from '../types/api';
import { formatTimestamp } from '../utils/formatters';
import { statusColors } from '../theme/darkTheme';

interface SessionPanelProps {
  sessions: SessionSummary[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onRerun: (sessionId: string) => void;
  onClose: () => void;
  onReload: () => void;
}

export function SessionPanel({
  sessions, currentSessionId, onSelectSession, onRerun, onClose, onReload,
}: SessionPanelProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (sessionId: string) => {
    try {
      await navigator.clipboard.writeText(sessionId);
      setCopiedId(sessionId);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = sessionId;
      ta.style.cssText = 'position:fixed;left:-9999px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopiedId(sessionId);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  if (sessions.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="h6">Sessions</Typography>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>
        <Typography sx={{ color: '#b8b8b8', textAlign: 'center', py: 5 }}>No sessions yet</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Sessions</Typography>
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          <IconButton onClick={onReload} size="small"><ReplayIcon fontSize="small" /></IconButton>
          <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
        </Box>
      </Box>
      <List dense>
        {sessions.map(s => {
          const isActive = s.id === currentSessionId;
          return (
            <ListItem key={s.id} disablePadding sx={{ mb: 1 }}>
              <ListItemButton
                onClick={() => onSelectSession(s.id)}
                sx={{
                  bgcolor: isActive ? '#e86078' : '#1c3d6e',
                  borderRadius: 2,
                  borderColor: isActive ? '#ff8090' : 'transparent',
                  borderWidth: 1,
                  borderStyle: 'solid',
                  '&:hover': { bgcolor: isActive ? '#e86078' : '#234b7e' },
                }}
              >
                <ListItemText
                  primary={
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="body2" sx={{ fontWeight: 'bold', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {s.workflowName || 'Unnamed'}
                      </Typography>
                      <Chip
                        label={s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                        size="small"
                        sx={{
                          bgcolor: statusColors[s.status] || '#909090',
                          color: '#fff',
                          fontSize: 10,
                          height: 20,
                        }}
                      />
                    </Box>
                  }
                  secondary={
                    <>
                      <Typography variant="caption" sx={{ color: isActive ? '#ffe8ec' : '#c4d4e8', display: 'block' }}>
                        {formatTimestamp(s.startTime)} &middot; {s.nodeCount} nodes
                      </Typography>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: 0.5 }}>
                        <Typography
                          variant="caption"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: 10,
                            color: isActive ? '#ffdee5' : '#dce8f5',
                            flex: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {s.id}
                        </Typography>
                        <IconButton
                          size="small"
                          onClick={(e) => { e.stopPropagation(); handleCopy(s.id); }}
                          sx={{ color: 'rgba(255,255,255,0.7)', p: 0.5, minWidth: 24 }}
                        >
                          {copiedId === s.id ? <CheckIcon fontSize="small" /> : <ContentCopyIcon fontSize="small" />}
                        </IconButton>
                      </Box>
                      {s.status !== 'running' && (
                        <Button
                          size="small"
                          onClick={(e) => { e.stopPropagation(); onRerun(s.id); }}
                          sx={{ mt: 1, bgcolor: '#2ecc71', color: '#fff', '&:hover': { bgcolor: '#27ae60' }, fontSize: 11 }}
                          startIcon={<ReplayIcon fontSize="small" />}
                        >
                          Rerun
                        </Button>
                      )}
                    </>
                  }
                />
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
    </Box>
  );
}
