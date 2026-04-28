import * as fs from 'fs/promises';
import * as path from 'path';
import type { WorkflowDefinition } from '../../types.js';
import { GLOBAL_CONTEXT } from '../../utils/GlobalContext.js';

export interface NodeDetailResponse {
  definition: WorkflowDefinition['nodes'][number];
  status: string;
  inputs: Record<string, any> | null;
  output: any;
  audit: any;
  claudeMessages: any[] | null;
  claudeHtmlUrl: string | null;
}

export async function getNodeDetail(
  nodeId: string,
  sessionId: string,
  workflow: WorkflowDefinition
): Promise<NodeDetailResponse> {
  const nodeDef = workflow.nodes.find(n => n.id === nodeId);
  if (!nodeDef) throw new Error(`Node ${nodeId} not found`);

  const executor = GLOBAL_CONTEXT.executions.get(sessionId);
  const nodeInstance = executor?.getNodes().get(nodeId);
  const status = nodeInstance?.status || 'pending';

  let output: any = null;
  try {
    const fp = path.join(GLOBAL_CONTEXT.outputDir!, sessionId, `${nodeId}.json`);
    output = JSON.parse(await fs.readFile(fp, 'utf-8'));
  } catch { /* not available */ }

  const inputs: Record<string, any> = {};
  for (const edge of workflow.edges || []) {
    if (edge.to?.nodeId === nodeId) {
      try {
        const fp = path.join(GLOBAL_CONTEXT.outputDir!, sessionId, `${edge.from.nodeId}.json`);
        inputs[edge.to.input] = JSON.parse(await fs.readFile(fp, 'utf-8'));
      } catch { /* not available */ }
    }
    if (edge.condition?.branches) {
      for (const branch of edge.condition.branches) {
        if (branch.to.nodeId === nodeId) {
          try {
            const fp = path.join(GLOBAL_CONTEXT.outputDir!, sessionId, `${edge.from.nodeId}.json`);
            inputs[branch.to.input] = JSON.parse(await fs.readFile(fp, 'utf-8'));
          } catch { /* not available */ }
        }
      }
    }
  }

  let audit: any = null;
  try {
    const files = await fs.readdir(GLOBAL_CONTEXT.auditDir!);
    const nodeFiles = files.filter(f => f.startsWith(nodeId + '-') && f.endsWith('.json'));
    if (nodeFiles.length > 0) {
      const sessionFiles = nodeFiles.filter(f => f.includes(sessionId) || f.startsWith(nodeId));
      const latest = sessionFiles.sort().pop() || nodeFiles.sort().pop();
      if (latest) {
        audit = JSON.parse(await fs.readFile(path.join(GLOBAL_CONTEXT.auditDir!, latest), 'utf-8'));
      }
    }
  } catch { /* not available */ }

  let claudeMessages: any[] | null = null;
  let claudeHtmlUrl: string | null = null;
  if (nodeDef.type === 'claude-code' && sessionId) {
    try {
      const files = await fs.readdir(GLOBAL_CONTEXT.auditDir!);
      const msgFiles = files.filter(f => f.includes(sessionId) && f.includes(nodeId) && f.endsWith('-messages.json'));
      if (msgFiles.length > 0) {
        const latest = msgFiles.sort().pop();
        if (latest) {
          claudeMessages = JSON.parse(await fs.readFile(path.join(GLOBAL_CONTEXT.auditDir!, latest), 'utf-8'));
        }
      }
    } catch { /* not available */ }

    try {
      const htmlDir = path.join(GLOBAL_CONTEXT.outputDir!, sessionId);
      const htmlFiles = (await fs.readdir(htmlDir)).filter(f =>
        f.startsWith('claude_code_') && f.endsWith(`_${nodeId}.html`)
      );
      if (htmlFiles.length > 0) {
        claudeHtmlUrl = `/api/v1/nodes/${nodeId}/claude-html?sessionId=${sessionId}`;
      }
    } catch { /* not available */ }
  }

  return { definition: nodeDef, status, inputs: Object.keys(inputs).length > 0 ? inputs : null, output, audit, claudeMessages, claudeHtmlUrl };
}

export async function getNodeClaudeHtml(nodeId: string, sessionId: string): Promise<string> {
  const htmlDir = path.join(GLOBAL_CONTEXT.outputDir!, sessionId);
  const htmlFiles = (await fs.readdir(htmlDir)).filter(f =>
    f.startsWith('claude_code_') && f.endsWith(`_${nodeId}.html`)
  );
  if (htmlFiles.length === 0) throw new Error('HTML export not found');
  const latest = htmlFiles.sort().pop()!;
  return await fs.readFile(path.join(htmlDir, latest), 'utf-8');
}
