import * as fs from 'fs/promises';
import * as path from 'path';
import type { AuditEntry } from '../types.js';

export class AuditLogger {
  private auditDir: string;
  private entries: Map<string, AuditEntry> = new Map();

  constructor(auditDir: string) {
    this.auditDir = auditDir;
  }

  /**
  * Start a new audit entry
   */
  start(nodeId: string, extra: { tempDir: string }): AuditEntry {
    const entry: AuditEntry = {
      id: `${nodeId}-${Date.now()}`,
      timestamp: new Date().toISOString(),
      nodeId,
      phase: 'start',
      execution: {
        tempDir: extra.tempDir,
        duration: 0,
        exitCode: -1
      }
    };

    this.entries.set(entry.id, entry);
    return entry;
  }

  /**
  * Update audit entry phase
   */
  update(entry: AuditEntry, phase: 'validate' | 'execute' | 'retry'): void {
    entry.phase = phase;
    entry.timestamp = new Date().toISOString();
  }

  /**
  * Mark audit entry as complete
   */
  complete(entry: AuditEntry): void {
    entry.phase = 'complete';
    if (entry.execution) {
      entry.execution.duration = Date.now() - new Date(entry.timestamp).getTime();
    }
    this.persist(entry);
  }

  /**
  * Mark audit entry as failed
   */
  error(entry: AuditEntry): void {
    entry.phase = 'error';
    this.persist(entry);
  }

  /**
  * Mark audit entry as skipped
   */
  skipped(entry: AuditEntry): void {
    entry.phase = 'skipped';
    this.persist(entry);
  }

  /**
  * Persist audit entry to disk
   */
  private async persist(entry: AuditEntry): Promise<void> {
    const logFile = path.join(this.auditDir, `${entry.id}.json`);
    await fs.writeFile(logFile, JSON.stringify(entry, null, 2));
  }

  /**
  * Get all audit entries
   */
  getEntries(): AuditEntry[] {
    return Array.from(this.entries.values());
  }
}
