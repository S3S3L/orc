import { Executor } from "../core/Executor";
import { ExecutionState, SessionSummary, WorkflowDefinition } from "../types";
import * as fs from 'fs/promises';
import * as path from 'path';

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

    // Session store file path
    private _storePath: string | null = null;

    async setStorePath(baseDir: string) {
        this._storePath = path.join(baseDir, '.sessions.json');
        await this.loadSessions();
    }

    private async ensureStoreDir() {
        if (!this._storePath) return;
        await fs.mkdir(path.dirname(this._storePath), { recursive: true });
    }

    async loadSessions() {
        if (!this._storePath) return;
        try {
            const data = await fs.readFile(this._storePath, 'utf-8');
            const sessions = JSON.parse(data) as SessionSummary[];
            // Only keep completed/errored sessions (running ones are likely stale)
            this.sessionHistory = sessions.filter(s => s.status !== 'running');
        } catch {
            this.sessionHistory = [];
        }
    }

    async saveSessions() {
        if (!this._storePath) return;
        await this.ensureStoreDir();
        // Persist all non-reused-session entries (skip reused sessions)
        const data = JSON.stringify(this.sessionHistory, null, 2);
        await fs.writeFile(this._storePath, data, 'utf-8');
    }
}

export const GLOBAL_CONTEXT = new GlobalContext();
