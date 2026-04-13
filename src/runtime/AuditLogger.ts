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
   * 开始一个新的审计条目
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
   * 更新审计条目状态
   */
  update(entry: AuditEntry, phase: 'validate' | 'execute' | 'retry'): void {
    entry.phase = phase;
    entry.timestamp = new Date().toISOString();
  }

  /**
   * 标记审计条目为完成
   */
  complete(entry: AuditEntry): void {
    entry.phase = 'complete';
    if (entry.execution) {
      entry.execution.duration = Date.now() - new Date(entry.timestamp).getTime();
    }
    this.persist(entry);
  }

  /**
   * 标记审计条目为错误
   */
  error(entry: AuditEntry): void {
    entry.phase = 'error';
    this.persist(entry);
  }

  /**
   * 标记审计条目为跳过
   */
  skipped(entry: AuditEntry): void {
    entry.phase = 'skipped';
    this.persist(entry);
  }

  /**
   * 持久化审计条目到文件
   */
  private async persist(entry: AuditEntry): Promise<void> {
    const logFile = path.join(this.auditDir, `${entry.id}.json`);
    await fs.writeFile(logFile, JSON.stringify(entry, null, 2));
  }

  /**
   * 获取所有审计条目
   */
  getEntries(): AuditEntry[] {
    return Array.from(this.entries.values());
  }
}
