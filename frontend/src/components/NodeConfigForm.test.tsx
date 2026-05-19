import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodeConfigForm } from './NodeConfigForm';

describe('NodeConfigForm', () => {
  it('renders script field for bash node', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="bash" config={{}} onChange={onChange} />);

    expect(screen.getByLabelText('Script Path')).toBeInTheDocument();
    expect(screen.getByText('Advanced Config')).toBeInTheDocument();
  });

  it('renders script field for python node', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="python" config={{}} onChange={onChange} />);
    expect(screen.getByLabelText('Script Path')).toBeInTheDocument();
  });

  it('renders script field for node (js) type', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="node" config={{}} onChange={onChange} />);
    expect(screen.getByLabelText('Script Path')).toBeInTheDocument();
  });

  it('renders prompt field for claude-code node', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="claude-code" config={{}} onChange={onChange} />);
    expect(screen.getByLabelText('Prompt Markdown')).toBeInTheDocument();
  });

  it('renders file path for file node', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="file" config={{}} onChange={onChange} />);
    expect(screen.getByLabelText('File Path')).toBeInTheDocument();
    // file type does NOT have Advanced Config
    expect(screen.queryByLabelText('Advanced Config')).not.toBeInTheDocument();
  });

  it('renders maxAttempts and validator for loop node', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="loop" config={{}} onChange={onChange} />);
    expect(screen.getByLabelText('Max Attempts')).toBeInTheDocument();
    expect(screen.getByLabelText('Validator Expression')).toBeInTheDocument();
  });

  it('renders raw JSON for unknown node type', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="custom-type" config={{}} onChange={onChange} />);
    expect(screen.getByLabelText('Raw JSON')).toBeInTheDocument();
  });

  it('calls onChange when script field changes (bash)', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="bash" config={{}} onChange={onChange} />);

    const input = screen.getByLabelText('Script Path');
    fireEvent.change(input, { target: { value: './my-script.sh' } });

    expect(onChange).toHaveBeenCalledWith({ script: './my-script.sh' });
  });

  it('calls onChange when prompt.markdown changes (claude-code)', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="claude-code" config={{}} onChange={onChange} />);

    const input = screen.getByLabelText('Prompt Markdown');
    fireEvent.change(input, { target: { value: '# Hello' } });

    expect(onChange).toHaveBeenCalledWith({ prompt: { markdown: '# Hello' } });
  });

  it('calls onChange when maxAttempts changes (loop)', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="loop" config={{ maxAttempts: 5 }} onChange={onChange} />);

    const input = screen.getByLabelText('Max Attempts');
    fireEvent.change(input, { target: { value: '10' } });

    expect(onChange).toHaveBeenCalledWith({ maxAttempts: 10 });
  });

  it('renders subGraph JSON editor for loop node', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="loop" config={{}} onChange={onChange} />);

    // Open the accordion
    fireEvent.click(screen.getByText('SubGraph (raw JSON)'));

    const textarea = screen.getByLabelText('SubGraph JSON');
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveValue('{"nodes":[],"edges":[]}');
  });

  it('preserves existing config when updating a field', () => {
    const onChange = vi.fn();
    render(<NodeConfigForm nodeType="bash" config={{ extra: 'data', script: 'old.sh' }} onChange={onChange} />);

    const input = screen.getByLabelText('Script Path');
    fireEvent.change(input, { target: { value: 'new.sh' } });

    expect(onChange).toHaveBeenCalledWith({ extra: 'data', script: 'new.sh' });
  });
});
