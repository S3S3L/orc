import { Executor } from "../core/Executor";
import { ExecutionState, WorkflowDefinition } from "../types";

class GlobalContext {
    // Global state for the Web UI
    lastWorkflow: WorkflowDefinition | null = null;
    executionStates = new Map<string, ExecutionState>();
    executions = new Map<string, Executor>(); // Store executors so status can be queried later
}

export const GLOBAL_CONTEXT = new GlobalContext();