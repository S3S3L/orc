import { createTheme } from '@mui/material/styles';

export const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: { main: '#e94560' },
    secondary: { main: '#0f3460' },
    background: { default: '#1a1a2e', paper: '#16213e' },
    success: { main: '#4cd260' },
    error: { main: '#ff6b5a' },
    warning: { main: '#f39c12' },
    info: { main: '#5dade2' },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: { backgroundImage: 'none' },
      },
    },
    MuiListItem: {
      styleOverrides: {
        root: { borderRadius: 8 },
      },
    },
  },
});

// Node type colors for cytoscape
export const nodeColors: Record<string, string> = {
  bash: '#3498db',
  python: '#f39c12',
  node: '#2ecc71',
  'claude-code': '#9b59b6',
  loop: '#e67e22',
};

// Status colors
export const statusColors: Record<string, string> = {
  pending: '#909090',
  running: '#5dade2',
  success: '#4cd260',
  failed: '#ff6b5a',
  skipped: '#c08fd6',
};
