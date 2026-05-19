import '@testing-library/jest-dom';

// MUI theme provider wrapper for tests
import { ThemeProvider } from '@mui/material/styles';
import { render as rtlRender } from '@testing-library/react';
import { darkTheme } from '../theme/darkTheme';

export function render(ui: React.ReactElement, options = {}) {
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <ThemeProvider theme={darkTheme}>{children}</ThemeProvider>
    ),
    ...options,
  });
}
