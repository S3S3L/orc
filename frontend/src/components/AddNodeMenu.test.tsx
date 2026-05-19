import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AddNodeMenu, nodeTypes } from './AddNodeMenu';

describe('AddNodeMenu', () => {
  it('renders popover content when anchorEl is provided', () => {
    const anchorEl = document.createElement('button');
    document.body.appendChild(anchorEl);

    render(<AddNodeMenu anchorEl={anchorEl} onClose={vi.fn()} onSelect={vi.fn()} />);

    expect(screen.getByText('Add Node')).toBeInTheDocument();
    for (const nt of nodeTypes) {
      expect(screen.getByText(nt.label)).toBeInTheDocument();
    }
  });

  it('calls onSelect with correct type and closes menu', () => {
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const anchorEl = document.createElement('button');
    document.body.appendChild(anchorEl);

    render(<AddNodeMenu anchorEl={anchorEl} onClose={onClose} onSelect={onSelect} />);

    fireEvent.click(screen.getByText('Bash'));
    expect(onSelect).toHaveBeenCalledWith('bash');
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
