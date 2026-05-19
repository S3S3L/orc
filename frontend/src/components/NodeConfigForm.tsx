import { TextField, Typography, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

interface NodeConfigFormProps {
  nodeType: string;
  config: Record<string, any>;
  onChange: (config: Record<string, any>) => void;
}

export function NodeConfigForm({ nodeType, config, onChange }: NodeConfigFormProps) {
  const updateConfig = (key: string, value: any) => {
    onChange({ ...config, [key]: value });
  };

  const updateNestedConfig = (parentKey: string, childKey: string, value: any) => {
    const parent = config[parentKey] || {};
    onChange({ ...config, [parentKey]: { ...parent, [childKey]: value } });
  };

  switch (nodeType) {
    case 'bash':
    case 'python':
    case 'node':
      return (
        <>
          <TextField
            fullWidth
            size="small"
            label="Script Path"
            value={config.script || ''}
            onChange={e => updateConfig('script', e.target.value)}
            sx={{ mb: 1, mt: 1 }}
            InputLabelProps={{ sx: { color: '#b8b8b8' } }}
            InputProps={{ sx: { color: '#fff', fontSize: 13 } }}
          />
          <Accordion sx={{ bgcolor: '#0d1b2a', border: '1px solid #333', mt: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />} sx={{ py: 0, minHeight: 32 }}>
              <Typography variant="caption" sx={{ color: '#b8b8b8' }}>Advanced Config</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                fullWidth
                size="small"
                label="Raw JSON"
                value={JSON.stringify(config, null, 2)}
                onChange={e => {
                  try {
                    onChange(JSON.parse(e.target.value));
                  } catch { /* ignore parse errors while typing */ }
                }}
                multiline
                rows={6}
                sx={{ fontFamily: 'monospace' }}
                InputLabelProps={{ sx: { color: '#b8b8b8' } }}
                InputProps={{ sx: { color: '#fff', fontSize: 12, fontFamily: 'monospace' } }}
              />
            </AccordionDetails>
          </Accordion>
        </>
      );

    case 'claude-code':
      return (
        <>
          <TextField
            fullWidth
            size="small"
            label="Prompt Markdown"
            value={config.prompt?.markdown || ''}
            onChange={e => updateNestedConfig('prompt', 'markdown', e.target.value)}
            sx={{ mb: 1, mt: 1 }}
            InputLabelProps={{ sx: { color: '#b8b8b8' } }}
            InputProps={{ sx: { color: '#fff', fontSize: 13 } }}
          />
          <Accordion sx={{ bgcolor: '#0d1b2a', border: '1px solid #333', mt: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />} sx={{ py: 0, minHeight: 32 }}>
              <Typography variant="caption" sx={{ color: '#b8b8b8' }}>Advanced Config</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                fullWidth
                size="small"
                label="Raw JSON"
                value={JSON.stringify(config, null, 2)}
                onChange={e => {
                  try {
                    onChange(JSON.parse(e.target.value));
                  } catch { /* ignore */ }
                }}
                multiline
                rows={8}
                sx={{ fontFamily: 'monospace' }}
                InputLabelProps={{ sx: { color: '#b8b8b8' } }}
                InputProps={{ sx: { color: '#fff', fontSize: 12, fontFamily: 'monospace' } }}
              />
            </AccordionDetails>
          </Accordion>
        </>
      );

    case 'file':
      return (
        <TextField
          fullWidth
          size="small"
          label="File Path"
          value={config.filePath || ''}
          onChange={e => updateConfig('filePath', e.target.value)}
          sx={{ mb: 1, mt: 1 }}
          InputLabelProps={{ sx: { color: '#b8b8b8' } }}
          InputProps={{ sx: { color: '#fff', fontSize: 13 } }}
        />
      );

    case 'loop':
      return (
        <>
          <TextField
            fullWidth
            size="small"
            label="Max Attempts"
            type="number"
            value={config.maxAttempts || 3}
            onChange={e => updateConfig('maxAttempts', parseInt(e.target.value, 10))}
            sx={{ mb: 1, mt: 1 }}
            InputLabelProps={{ sx: { color: '#b8b8b8' } }}
            InputProps={{ sx: { color: '#fff', fontSize: 13 } }}
          />
          <TextField
            fullWidth
            size="small"
            label="Validator Expression"
            value={config.validator || ''}
            onChange={e => updateConfig('validator', e.target.value)}
            sx={{ mb: 1 }}
            InputLabelProps={{ sx: { color: '#b8b8b8' } }}
            InputProps={{ sx: { color: '#fff', fontSize: 12, fontFamily: 'monospace' } }}
          />
          <Accordion sx={{ bgcolor: '#0d1b2a', border: '1px solid #333', mt: 1 }}>
            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#fff' }} />} sx={{ py: 0, minHeight: 32 }}>
              <Typography variant="caption" sx={{ color: '#b8b8b8' }}>SubGraph (raw JSON)</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <TextField
                fullWidth
                size="small"
                label="SubGraph JSON"
                value={config.subGraph ? JSON.stringify(config.subGraph, null, 2) : '{"nodes":[],"edges":[]}'}
                onChange={e => {
                  try {
                    updateConfig('subGraph', JSON.parse(e.target.value));
                  } catch { /* ignore */ }
                }}
                multiline
                rows={8}
                sx={{ fontFamily: 'monospace' }}
                InputLabelProps={{ sx: { color: '#b8b8b8' } }}
                InputProps={{ sx: { color: '#fff', fontSize: 12, fontFamily: 'monospace' } }}
              />
            </AccordionDetails>
          </Accordion>
        </>
      );

    default:
      return (
        <TextField
          fullWidth
          size="small"
          label="Raw JSON"
          value={JSON.stringify(config, null, 2)}
          onChange={e => {
            try {
              onChange(JSON.parse(e.target.value));
            } catch { /* ignore */ }
          }}
          multiline
          rows={6}
          sx={{ mb: 1, mt: 1, fontFamily: 'monospace' }}
          InputLabelProps={{ sx: { color: '#b8b8b8' } }}
          InputProps={{ sx: { color: '#fff', fontSize: 12, fontFamily: 'monospace' } }}
        />
      );
  }
}
