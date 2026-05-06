export function formatTimestamp(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
