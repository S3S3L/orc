export interface WorkflowDefinition {
  version: string;
  name: string;
  description?: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  schemas: Record<string, any>;
  schemaBaseDir?: string[];
}

export interface NodeDefinition {
  id: string;
  type: 'bash' | 'python' | 'node' | 'claude-code' | 'loop';
  name: string;
  description?: string;
  config: Record<string, any>;
}

export interface EdgeDefinition {
  id: string;
  from: { nodeId: string };
  to: { nodeId: string; input: string };
  condition?: {
    branches: Array<{ expression: string; to: { nodeId: string; input: string } }>;
    onNoMatch?: 'skip' | 'skip-node' | 'stop' | 'error';
  };
}

export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

export interface SessionSummary {
  id: string;
  workflowName: string;
  status: 'running' | 'complete' | 'error';
  startTime: number;
  endTime?: number;
  nodeCount: number;
  nodeStatuses?: Record<string, string>;
}

export interface ExecutionState {
  status: 'running' | 'complete' | 'error';
  logs: string[];
  startTime: number;
  complete: boolean;
  error?: string;
  nodes?: Array<{ definition: NodeDefinition; status: NodeStatus }>;
  nodeStatuses?: Record<string, NodeStatus>;
  endTime?: number;
}

export interface NodeDetailResponse {
  definition: NodeDefinition;
  status: NodeStatus;
  inputs: Record<string, any> | null;
  output: any;
  audit: any;
  claudeMessages: Array<{ role: string; content: string; id?: string }> | null;
  claudeHtmlUrl: string | null;
}

export interface SubgraphResponse {
  nodeId: string;
  subGraph: {
    nodes: NodeDefinition[];
    edges: EdgeDefinition[];
    schemas: Record<string, any>;
  };
  maxAttempts: number;
  validator: string;
}

export interface RunResponse {
  sessionId: string;
}
