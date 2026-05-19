import { useState, useCallback } from 'react';
import { api } from '../api';
import type { WorkflowDefinition, WorkflowMeta } from '../types/api';

export function useWorkflowEditor() {
  const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflowList, setWorkflowList] = useState<WorkflowMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const loadWorkflowList = useCallback(async () => {
    try {
      const list = await api.listWorkflows();
      setWorkflowList(list);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadWorkflow = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    setCurrentId(id);
    try {
      const wf = await api.getWorkflowById(id);
      setWorkflow(wf);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createWorkflow = useCallback(async (name: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const { id } = await api.createWorkflow(name);
      setCurrentId(id);
      await loadWorkflow(id);
      await loadWorkflowList();
      return id;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [loadWorkflowList]);

  const copyExample = useCallback(async (exampleId: string): Promise<string> => {
    setLoading(true);
    setError(null);
    try {
      const { id } = await api.copyExample(exampleId);
      setCurrentId(id);
      await loadWorkflow(id);
      await loadWorkflowList();
      return id;
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [loadWorkflowList]);

  const saveWorkflow = useCallback(async (id: string, wf: WorkflowDefinition) => {
    setLoading(true);
    setError(null);
    try {
      await api.saveWorkflow(id, wf);
      setWorkflow(wf);
      await loadWorkflowList();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [loadWorkflowList]);

  const deleteWorkflow = useCallback(async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      await api.deleteWorkflow(id);
      if (currentId === id) {
        setWorkflow(null);
        setCurrentId(null);
      }
      await loadWorkflowList();
    } catch (e) {
      setError((e as Error).message);
      throw e;
    } finally {
      setLoading(false);
    }
  }, [currentId, loadWorkflowList]);

  return {
    workflow,
    setWorkflow,
    currentId,
    loading,
    error,
    workflowList,
    loadWorkflowList,
    loadWorkflow,
    createWorkflow,
    copyExample,
    saveWorkflow,
    deleteWorkflow,
  };
}
