import { useState, useEffect } from 'react';
import { api } from '../api';
import type { WorkflowDefinition } from '../types/api';

export function useWorkflow(expandLoopNodeId?: string | null) {
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [loading, setLoading] = useState(true);

  const loadWorkflow = async () => {
    setLoading(true);
    try {
      let data: WorkflowDefinition;
      if (expandLoopNodeId) {
        data = await api.getWorkflowExpanded(expandLoopNodeId);
      } else {
        data = await api.getWorkflow();
      }
      setWorkflow(data);
    } catch (e) {
      console.error('Failed to load workflow:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWorkflow();
  }, [expandLoopNodeId]);

  return { workflow, loading, reload: loadWorkflow };
}
