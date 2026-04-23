import { Mutex } from 'async-mutex';
import { JSONSchema7 } from 'json-schema';

// ============ Node Type Enum ============
export type NodeType = 'bash' | 'python' | 'node' | 'claude-code' | 'loop';
export type Phase = 'start' | 'validate' | 'execute' | 'complete' | 'error' | 'retry' | 'skipped';
export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';

// ============ Base Config Interfaces ============
export interface RetryConfig {
  maxAttempts?: number;      // Defaults to 3 attempts
  backoff?: 'fixed' | 'exponential';  // Retry strategy
  delayMs?: number;          // Base delay (ms)
}

export interface BaseNodeConfig {
  timeout?: number;
  retry?: RetryConfig;
}

export interface InputMappingConfig {
  mergeStrategy?: 'merge' | 'array' | 'first';
  transformScript?: string;
}

export interface OutputMappingConfig {
  extractField?: string;
  transformScript?: string;
}

// ============ Bash Node Config ============
export interface BashConfig extends BaseNodeConfig {
  script: string;
  interpreter?: string;
  argsPassing: {
    type: 'stdin' | 'args' | 'file';
    argMapping?: Record<string, {
      type: 'string' | 'file' | 'raw';
      position?: number;
      template?: string;
    }>;
    fileName?: string;
  };
  envMapping?: Record<string, string>;
}

// ============ Python Node Config ============
export interface PythonConfig extends BaseNodeConfig {
  script: string;
  interpreter?: string;
  argsPassing?: {
    type: 'stdin' | 'args' | 'file';
    argMapping?: Record<string, {
      type: 'string' | 'file' | 'raw';
      position?: number;
    }>;
    fileName?: string;
  };
  requirements?: {
    file?: string;
    packages?: string[];
  };
}

// ============ Node Runtime Config ============
export interface NodeConfig extends BaseNodeConfig {
  script: string;
  runtime?: string;
  argsPassing?: {
    type: 'stdin' | 'args' | 'file';
    argMapping?: Record<string, {
      type: 'string' | 'file' | 'raw';
      position?: number;
    }>;
    fileName?: string;
  };
}

// ============ Claude Code Types ============
export interface AuditConfig {
  enabled: boolean;
  logStdout: boolean;
  logStderr: boolean;
  saveMessages: boolean;
}

export interface ConfigTemplate {
  name: string;
  path: string;
  template: string;
}

export interface InputMapping {
  target: 'markdown';
  section?: string;
  filePath?: string;
}

export interface ClaudeCodeResumeConfig {
  maxAttempts: number;
  prompt?: string;
  validator: string; // Validator script. Parameter: output. Returns true/false
}

export interface ClaudeCodeConfig extends BaseNodeConfig {
  prompt: {
    markdown: string;
    template?: boolean;
  };
  inputMapping?: Record<string, InputMapping>;
  execution: {
    audit?: AuditConfig;
  };
  resume?: ClaudeCodeResumeConfig;
  capabilities: {
    tools?: {
      allowed?: string[];
      denied?: string[];
    };
    enableSkills?: boolean;
    mcp?: {
      enabled?: string[];
      config?: string;
    };
  };
}

// ============ Loop Types ============

export interface LoopConfig extends BaseNodeConfig {
  subGraph: GraphDefinition;
  maxAttempts: number;
  validator: string; // Validator script. Parameter: outputs. e.g.: outputs[$nodeId].status === "success". Returns true/false
}

// ============ Union Config Types ============
export type NodeConfigUnion = BashConfig | PythonConfig | NodeConfig | ClaudeCodeConfig | LoopConfig;

// ============ Node Definitions ============
export interface NodeDefinition {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  inputs: Record<string, JSONSchema7>;
  output: { ref: string; schema: JSONSchema7 };
  config: NodeConfigUnion;
}

export interface NodeInstance {
  definition: NodeDefinition;
  status: NodeStatus;
  lock: Mutex;  // For synchronizing execution of this node
  depends: Map<string, boolean>;  // Completion state of dependent nodes: node ID -> boolean
}

// ============ Edge Definitions ============
export interface EdgeDefinition {
  id: string;
  from: { nodeId: string };
  to: { nodeId: string; input: string };  // Default target when there is no condition or no branch match
  transform?: (data: any) => any;
  condition?: {
    /**
    * Branch list evaluated in order. The first matching branch wins.
    * If empty or undefined, the edge executes unconditionally to the `to` target.
     */
    branches: Array<{
      expression: string;     // Branch condition expression
      to: { nodeId: string; input: string };  // Routing target when the condition matches
    }>;
    /**
    * Behavior when no branch matches (optional)
    * - 'skip': skip this edge
    * - 'skip-node': skip the target node
    * - 'stop': stop workflow execution
    * - 'error': throw an error
    * - undefined: use the edge `to` field as the default target
     */
    onNoMatch?: 'skip' | 'skip-node' | 'stop' | 'error';
  };
}

// ============ Workflow Definitions ============
export interface WorkflowDefinition extends GraphDefinition {
  version: string;
  name: string;
  description?: string;
  entryPoints?: string[];
}

// =========== JSON Schema Definition ============

export interface SchemaDefinition {
  schemaBaseDir?: string[];
  schemas: Record<string, JsonSchema>;
}

export interface JsonSchema {
  file?: string;
  content?: JSONSchema7;
}

// =========== Graph Definition ============

export interface GraphDefinition extends SchemaDefinition {
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
}

// ============ Execution Context ============
export interface ExecutionContext {
  workflowDef: WorkflowDefinition;
  workflowDir: string;
  outputDir: string;
  auditDir: string;
  tempBaseDir: string;
  sessionId: string;
  nodeOutputs: Map<string, any>;
  auditLog: AuditEntry[];
  debug: NodeDebuggingContext;
  cleanOldFiles: boolean;
}

export interface NodeDebuggingContext {
  startNodeId?: string;
  single?: boolean;
}

// ============ Execution State ============
export interface ExecutionState {
  status: 'running' | 'complete' | 'error';
  logs: string[];
  startTime: number;
  complete: boolean;
  error?: string;
}

// ============ Session Summary ============
export interface SessionSummary {
  id: string;
  workflowName: string;
  status: 'running' | 'complete' | 'error';
  startTime: number;
  endTime?: number;
  nodeCount: number;
}

// ============ Audit Entries ============
export interface AuditEntry {
  id: string;
  timestamp: string;
  nodeId: string;
  phase: Phase;
  inputs?: Record<string, any>;
  outputs?: any;
  execution?: {
    tempDir: string;
    duration: number;
    exitCode: number;
    stdout?: string;
    stderr?: string;
    claudeMessages?: any[];
  };
  retry?: {
    attempt: number;
    maxAttempts: number;
    delay: number;
  };
  persistedFiles?: {
    output: string;
    logs?: string[];
  };
  error?: string;
}
