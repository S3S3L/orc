import { Executor } from "../core/Executor";
import { ExecutionState, SessionSummary, WorkflowDefinition } from "../types";

class GlobalContext {
    // Global state for the Web UI
    lastWorkflow: WorkflowDefinition | null = null;
    executionStates = new Map<string, ExecutionState>();
    executions = new Map<string, Executor>(); // Store executors so status can be queried later

    // Directory paths (set by serve command)
    outputDir: string | null = null;
    auditDir: string | null = null;
    workspaceDir: string | null = null;

    // Session history (sorted by startTime desc)
    sessionHistory: SessionSummary[] = [];
}

export const GLOBAL_CONTEXT = new GlobalContext();
