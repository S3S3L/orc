import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Accordion, AccordionSummary, AccordionDetails,
  Button, Chip, CircularProgress,
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import { api } from '../api';
import { statusColors } from '../theme/darkTheme';
import { formatTimestamp } from '../utils/formatters';
import type { NodeDefinition } from '../types/api';

interface NodeDetailProps {
  node: NodeDefinition;
  sessionId: string | null;
  onRunNode: (nodeId: string) => void;
  onExpandLoop: (nodeId: string) => void;
  onShowClaudeReport: (nodeId: string, url: string) => void;
}

export function NodeDetail({ node, sessionId, onRunNode, onExpandLoop, onShowClaudeReport }: NodeDetailProps) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchDetail = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const data = await api.getNodeDetail(node.id, sessionId);
      setDetail(data);
    } catch (e) {
      console.error('Failed to fetch node detail:', e);
    } finally {
      setLoading(false);
    }
  }, [node.id, sessionId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  const status = detail?.status || 'pending';

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="subtitle2" sx={{ mb: 1, color: '#b8b8b8' }}>Node Detail</Typography>

      {loading ? (
        <CircularProgress size={20} sx={{ color: '#b8b8b8' }} />
      ) : (
        <>
          {/* Definition */}
          <Accordion defaultExpanded sx={{ bgcolor: '#0f3460', mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#b8b8b8' }} />}>
              <Typography variant="body2" sx={{ color: '#b8b8b8', fontWeight: 'bold' }}>Definition</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box component="pre" sx={{ fontSize: 12, color: '#ddd', margin: 0, whiteSpace: 'pre-wrap' }}>
{`ID: ${node.id}
Type: ${node.type}
Name: ${node.name}`}
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Status */}
          <Accordion sx={{ bgcolor: '#0f3460', mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#b8b8b8' }} />}>
              <Typography variant="body2" sx={{ color: '#b8b8b8', fontWeight: 'bold' }}>Status</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Chip
                label={status.charAt(0).toUpperCase() + status.slice(1)}
                size="small"
                sx={{ bgcolor: statusColors[status] || '#909090', color: '#fff' }}
              />
            </AccordionDetails>
          </Accordion>

          {/* Inputs */}
          <Accordion sx={{ bgcolor: '#0f3460', mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#b8b8b8' }} />}>
              <Typography variant="body2" sx={{ color: '#b8b8b8', fontWeight: 'bold' }}>Inputs</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box component="pre" sx={{ fontSize: 12, color: '#ddd', bgcolor: '#0a0a0a', p: 1.5, borderRadius: 1, maxHeight: 200, overflow: 'auto', margin: 0 }}>
                {detail?.inputs ? JSON.stringify(detail.inputs, null, 2) : 'No input data'}
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Output */}
          <Accordion sx={{ bgcolor: '#0f3460', mb: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#b8b8b8' }} />}>
              <Typography variant="body2" sx={{ color: '#b8b8b8', fontWeight: 'bold' }}>Output</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Box component="pre" sx={{ fontSize: 12, color: '#ddd', bgcolor: '#0a0a0a', p: 1.5, borderRadius: 1, maxHeight: 200, overflow: 'auto', margin: 0 }}>
                {detail?.output ? JSON.stringify(detail.output, null, 2) : 'No output data'}
              </Box>
            </AccordionDetails>
          </Accordion>

          {/* Execution Details */}
          {detail?.audit && (
            <Accordion sx={{ bgcolor: '#0f3460', mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#b8b8b8' }} />}>
                <Typography variant="body2" sx={{ color: '#b8b8b8', fontWeight: 'bold' }}>Execution Details</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Typography variant="body2" sx={{ fontSize: 12, color: '#d0d0d0' }}>
                  Phase: {detail.audit.phase} &nbsp; Time: {formatTimestamp(Date.parse(detail.audit.timestamp))}
                  {detail.audit.execution && (
                    <>
                      <br />Duration: {detail.audit.execution.duration}ms &nbsp; Exit Code: {detail.audit.execution.exitCode}
                      {detail.audit.execution.stdout && (
                        <>
                          <br />
                          <Box component="pre" sx={{ fontSize: 11, bgcolor: '#0a0a0a', p: 1, borderRadius: 1, maxHeight: 100, overflow: 'auto', mt: 1 }}>
                            {detail.audit.execution.stdout.slice(0, 500)}
                          </Box>
                        </>
                      )}
                      {detail.audit.execution.stderr && (
                        <>
                          <br />
                          <Typography sx={{ fontSize: 11, color: '#ff6b5a', mt: 0.5 }}>Stderr:</Typography>
                          <Box component="pre" sx={{ fontSize: 11, bgcolor: '#0a0a0a', p: 1, borderRadius: 1, maxHeight: 100, overflow: 'auto', color: '#ff6b5a' }}>
                            {detail.audit.execution.stderr.slice(0, 500)}
                          </Box>
                        </>
                      )}
                    </>
                  )}
                  {detail.audit.error && (
                    <Typography sx={{ fontSize: 12, color: '#ff6b5a', mt: 1 }}>Error: {detail.audit.error}</Typography>
                  )}
                  {detail.audit.retry && (
                    <Typography sx={{ fontSize: 12, color: '#f39c12', mt: 1 }}>
                      Retry: attempt {detail.audit.retry.attempt}/{detail.audit.retry.maxAttempts}, delay {detail.audit.retry.delay}ms
                    </Typography>
                  )}
                </Typography>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Claude Messages */}
          {node.type === 'claude-code' && detail?.claudeMessages && detail.claudeMessages.length > 0 && (
            <Accordion sx={{ bgcolor: '#0f3460', mb: 1 }}>
              <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#b8b8b8' }} />}>
                <Typography variant="body2" sx={{ color: '#b8b8b8', fontWeight: 'bold' }}>Claude Conversation</Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ maxHeight: 300, overflowY: 'auto' }}>
                  {detail.claudeMessages.map((msg: any, idx: number) => {
                    const content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content, null, 2);
                    const truncated = content.length > 300 ? content.slice(0, 300) : content;
                    const needsToggle = content.length > 300;
                    return (
                      <ClaudeMessage key={idx} role={msg.role} content={content} truncated={truncated} needsToggle={needsToggle} />
                    );
                  })}
                </Box>
              </AccordionDetails>
            </Accordion>
          )}

          {/* Actions */}
          <Box sx={{ display: 'flex', gap: 1, mt: 2 }}>
            <Button
              size="small"
              onClick={() => onRunNode(node.id)}
              sx={{ bgcolor: '#2ecc71', color: '#fff', '&:hover': { bgcolor: '#27ae60' } }}
              startIcon={<PlayArrowIcon />}
            >
              Run This Node
            </Button>
            {node.type === 'loop' && (
              <Button
                size="small"
                onClick={() => onExpandLoop(node.id)}
                sx={{ bgcolor: '#e67e22', color: '#fff', '&:hover': { bgcolor: '#d35400' } }}
              >
                Expand Subgraph
              </Button>
            )}
            {detail?.claudeHtmlUrl && (
              <Button
                size="small"
                onClick={() => onShowClaudeReport(node.id, detail.claudeHtmlUrl)}
                sx={{ bgcolor: '#9b59b6', color: '#fff', '&:hover': { bgcolor: '#8e44ad' } }}
              >
                View Report
              </Button>
            )}
          </Box>
        </>
      )}
    </Box>
  );
}

function ClaudeMessage({ role, content, truncated, needsToggle }: {
  role: string; content: string; truncated: string; needsToggle: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const borderColors: Record<string, string> = { user: '#3498db', assistant: '#9b59b6', system: '#ff6b5a' };
  return (
    <Box sx={{
      p: 1, mb: 1, borderRadius: 1, fontSize: 12,
      bgcolor: role === 'user' ? '#1a5276' : role === 'assistant' ? '#0f3460' : '#2c3e50',
      borderLeft: `3px solid ${borderColors[role] || '#888'}`,
    }}>
      <Typography sx={{ fontSize: 10, color: '#b8b8b8', fontWeight: 'bold', mb: 0.5 }}>
        {role.toUpperCase()}
      </Typography>
      <Box component="pre" sx={{
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#ddd', margin: 0,
        maxHeight: expanded ? 'none' : 80, overflow: 'hidden', position: 'relative',
      }}>
        {expanded ? content : truncated}
        {!expanded && needsToggle && (
          <Box sx={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: 30,
            background: 'linear-gradient(transparent, #0f3460)',
          }} />
        )}
      </Box>
      {needsToggle && (
        <Typography
          sx={{ fontSize: 11, color: '#3498db', cursor: 'pointer', mt: 0.5, '&:hover': { color: '#5dade2' } }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '[Show less]' : '[Show more]'}
        </Typography>
      )}
    </Box>
  );
}
