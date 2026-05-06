import { useState, useEffect } from 'react';
import { api } from '../api';
import type { SessionSummary } from '../types/api';

export function useSessionList() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);

  const loadSessions = async () => {
    try {
      const data = await api.getSessions();
      setSessions(data);
    } catch (e) {
      console.error('Failed to load sessions:', e);
    }
  };

  useEffect(() => {
    loadSessions();
  }, []);

  return { sessions, reload: loadSessions };
}
