import type { WorkflowMeta, WorkflowDefinition } from '../types/api';

const BASE_URL = ''; // Relative URL, proxied by Vite dev server

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

export const api = {
  getWorkflow: () => request<import('../types/api').WorkflowDefinition>('/api/v1/workflow'),
  getWorkflowExpanded: (loopNodeId: string) =>
    request<import('../types/api').WorkflowDefinition>(`/api/v1/workflow/expand?loopNodeId=${loopNodeId}`),
  getSessions: () => request<import('../types/api').SessionSummary[]>('/api/v1/sessions'),
  runSession: (params?: { sessionId?: string; cleanOldFiles?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.sessionId) qs.set('sessionId', params.sessionId);
    if (params?.cleanOldFiles) qs.set('cleanOldFiles', 'true');
    return request<import('../types/api').RunResponse>(`/api/v1/sessions?${qs}`, { method: 'POST' });
  },
  rerunSession: (sessionId: string) =>
    request<import('../types/api').RunResponse>(`/api/v1/sessions/${sessionId}/rerun`, { method: 'POST' }),
  getSessionStatus: (sessionId: string) =>
    request<import('../types/api').ExecutionState>(`/api/v1/sessions/${sessionId}/status`),
  getNodeDetail: (nodeId: string, sessionId: string) =>
    request<import('../types/api').NodeDetailResponse>(`/api/v1/nodes/${nodeId}?sessionId=${sessionId}`),
  runNode: (nodeId: string, params?: { sessionId?: string; single?: boolean }) => {
    const qs = new URLSearchParams();
    if (params?.sessionId) qs.set('sessionId', params.sessionId);
    if (params?.single) qs.set('single', 'true');
    return request<import('../types/api').RunResponse>(`/api/v1/nodes/${nodeId}/run?${qs}`, { method: 'POST' });
  },
  getNodeClaudeHtml: (nodeId: string, sessionId: string) =>
    request<string>(`/api/v1/nodes/${nodeId}/claude-html?sessionId=${sessionId}`),
  getLoopSubgraph: (nodeId: string) =>
    request<import('../types/api').SubgraphResponse>(`/api/v1/loops/${nodeId}/subgraph`),

  // Editor APIs
  listWorkflows: () => request<WorkflowMeta[]>('/api/v1/editor/workflows'),
  createWorkflow: (name: string) =>
    request<{ id: string }>('/api/v1/editor/workflows', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  copyExample: (exampleId: string) =>
    request<{ id: string }>(`/api/v1/editor/workflows/${exampleId}/copy`, {
      method: 'POST',
    }),
  getWorkflowById: (id: string) =>
    request<WorkflowDefinition>(`/api/v1/editor/workflow/${id}`),
  saveWorkflow: (id: string, workflow: WorkflowDefinition) =>
    request<{ status: string }>(`/api/v1/editor/workflow/${id}`, {
      method: 'PUT',
      body: JSON.stringify(workflow),
    }),
  deleteWorkflow: (id: string) =>
    request<void>(`/api/v1/editor/workflow/${id}`, {
      method: 'DELETE',
    }),
};
