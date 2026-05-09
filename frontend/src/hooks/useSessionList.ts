import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import type { SessionSummary } from '../types/api';

export function useSessionList() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const data = await api.getSessions();
      setSessions(data);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    pollRef.current = setInterval(loadSessions, 2000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadSessions]);

  return { sessions, reload: loadSessions };
}
