import {
  Popover, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography,
} from '@mui/material';
import { Terminal, Code, Language, Description, SmartToy, Loop } from '@mui/icons-material';

const nodeTypes = [
  { type: 'bash', label: 'Bash', icon: <Terminal fontSize="small" />, color: '#2ecc71' },
  { type: 'python', label: 'Python', icon: <Code fontSize="small" />, color: '#3498db' },
  { type: 'node', label: 'Node.js', icon: <Language fontSize="small" />, color: '#f39c12' },
  { type: 'file', label: 'File', icon: <Description fontSize="small" />, color: '#95a5a6' },
  { type: 'claude-code', label: 'Claude Code', icon: <SmartToy fontSize="small" />, color: '#e74c3c' },
  { type: 'loop', label: 'Loop', icon: <Loop fontSize="small" />, color: '#9b59b6' },
];

interface AddNodeMenuProps {
  anchorEl: HTMLElement | null;
  onClose: () => void;
  onSelect: (type: string) => void;
}

export function AddNodeMenu({ anchorEl, onClose, onSelect }: AddNodeMenuProps) {
  return (
    <Popover
      open={Boolean(anchorEl)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
      PaperProps={{ sx: { bgcolor: '#1a1a2e', border: '1px solid #505050' } }}
    >
      <Typography variant="caption" sx={{ px: 2, pt: 1, pb: 0, color: '#b8b8b8' }}>
        Add Node
      </Typography>
      <List dense sx={{ py: 0 }}>
        {nodeTypes.map(nt => (
          <ListItem key={nt.type} disablePadding>
            <ListItemButton
              onClick={() => { onSelect(nt.type); onClose(); }}
              sx={{
                '&:hover': { bgcolor: `${nt.color}22` },
              }}
            >
              <ListItemIcon sx={{ color: nt.color, minWidth: 36 }}>{nt.icon}</ListItemIcon>
              <ListItemText primary={nt.label} primaryTypographyProps={{ sx: { color: '#fff', fontSize: 13 } }} />
            </ListItemButton>
          </ListItem>
        ))}
      </List>
    </Popover>
  );
}

export { nodeTypes };
