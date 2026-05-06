import { Box, CircularProgress, Typography } from '@mui/material';

interface LoadingOverlayProps {
  visible: boolean;
  message?: string;
}

export function LoadingOverlay({ visible, message = 'Loading session...' }: LoadingOverlayProps) {
  return (
    <Box sx={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      bgcolor: 'rgba(10, 10, 20, 0.6)',
      display: visible ? 'flex' : 'none',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
    }}>
      <Box sx={{
        display: 'flex', alignItems: 'center', gap: 2,
        bgcolor: 'rgba(22, 33, 62, 0.95)',
        p: 2, borderRadius: 2, fontSize: 14, color: '#fff',
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
      }}>
        <CircularProgress size={20} sx={{ color: '#e94560' }} />
        <Typography>{message}</Typography>
      </Box>
    </Box>
  );
}
