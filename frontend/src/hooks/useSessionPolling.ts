import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import type { ExecutionState, NodeStatus } from '../types/api';

export function useSessionPolling(
  sessionId: string | null,
  onNodeStatusChange?: (nodeId: string, status: NodeStatus) => void
) {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<ExecutionState | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionIdRef = useRef(sessionId);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearTimeout(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const poll = useCallback(async () => {
    if (!sessionIdRef.current) return;
    try {
      const data = await api.getSessionStatus(sessionIdRef.current);
      setStatus(data);
      setLoading(false);

      // Apply node status changes
      if (data.nodes) {
        for (const node of data.nodes) {
          onNodeStatusChange?.(node.definition.id, node.status);
        }
      } else if (data.nodeStatuses) {
        for (const [nid, s] of Object.entries(data.nodeStatuses)) {
          onNodeStatusChange?.(nid, s as NodeStatus);
        }
      }

      // Stop polling if session is complete
      if (data.complete || data.endTime) {
        stopPolling();
        return;
      }
    } catch {
      // Session may not be ready yet, continue polling
    }
    pollRef.current = setTimeout(poll, 1000);
  }, [onNodeStatusChange, stopPolling]);

  useEffect(() => {
    sessionIdRef.current = sessionId;
    if (!sessionId) {
      setStatus(null);
      setLoading(true);
      stopPolling();
      return;
    }

    setLoading(true);
    stopPolling();
    poll();

    return stopPolling;
  }, [sessionId, poll, stopPolling]);

  return { loading, status, stopPolling };
}
