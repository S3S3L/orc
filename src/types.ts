import { JSONSchema7 } from 'json-schema';

// ============ 节点类型枚举 ============
export type NodeType = 'bash' | 'python' | 'node' | 'claude-code';
export type Phase = 'start' | 'validate' | 'execute' | 'complete' | 'error' | 'retry' | 'skipped';
export type NodeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

// ============ 基础配置接口 ============
export interface RetryConfig {
  maxAttempts?: number;      // 默认 3 次
  backoff?: 'fixed' | 'exponential';  // 重试策略
  delayMs?: number;          // 基础延迟 (ms)
}

export interface ConditionConfig {
  expression: string;        // 条件表达式
  onSkip?: 'pass-empty' | 'error';  // 跳过时的行为
}

export interface BaseNodeConfig {
  inputMapping?: InputMappingConfig;
  outputMapping?: OutputMappingConfig;
  timeout?: number;
  retry?: RetryConfig;
  condition?: ConditionConfig;
}

export interface InputMappingConfig {
  mergeStrategy?: 'merge' | 'array' | 'first';
  transformScript?: string;
}

export interface OutputMappingConfig {
  extractField?: string;
  transformScript?: string;
}

// ============ Bash 节点配置 ============
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

// ============ Python 节点配置 ============
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

// ============ Node 节点配置 ============
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

// ============ Claude Code 相关类型 ============
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
  target: 'markdown' | 'prompt' | 'file';
  section?: string;
  filePath?: string;
}

export interface ClaudeCodeConfig extends BaseNodeConfig {
  prompt: {
    markdown: string;
    template?: boolean;
  };
  inputMapping?: Record<string, InputMapping>;
  execution: {
    workDir: string;
    outputFile: string;
    audit?: AuditConfig;
  };
  capabilities: {
    tools?: {
      allowed?: string[];
      denied?: string[];
    };
    skills?: {
      activate?: string[];
      available?: string[];
    };
    mcp?: {
      enabled?: string[];
      config?: string;
    };
  };
  configTemplates?: ConfigTemplate[];
}

// ============ 联合配置类型 ============
export type NodeConfigUnion = BashConfig | PythonConfig | NodeConfig | ClaudeCodeConfig;

// ============ 节点定义 ============
export interface NodeDefinition {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  inputs: Record<string, JSONSchema7>;
  output: JSONSchema7;
  config: NodeConfigUnion;
}

export interface NodeInstance {
  definition: NodeDefinition;
  status: NodeStatus;
  depends: Map<string, boolean>;  // 依赖的节点的完成状态，节点ID映射到布尔值
}

// ============ 边定义 ============
export interface EdgeDefinition {
  id: string;
  from: { nodeId: string };
  to: { nodeId: string; input: string };  // 默认目标（当没有 condition 或 branches 无匹配时使用）
  transform?: (data: any) => any;
  condition?: {
    /**
     * 分支列表，按顺序评估，第一个匹配的分支生效
     * 如果为空或 undefined，边无条件执行到 to 指定的目标
     */
    branches: Array<{
      expression: string;     // 分支条件表达式
      to: { nodeId: string; input: string };  // 条件满足时的路由目标
    }>;
    /**
     * 没有分支匹配时的行为（可选）
     * - 'skip': 跳过这条边
     * - 'skip-node': 跳过目标节点
     * - 'stop': 停止工作流执行
     * - 'error': 抛出错误
     * - undefined: 使用边的 to 字段作为默认目标
     */
    onNoMatch?: 'skip' | 'skip-node' | 'stop' | 'error';
  };
}

// ============ 工作流定义 ============
export interface WorkflowDefinition {
  version: string;
  name: string;
  description?: string;
  nodes: NodeDefinition[];
  edges: EdgeDefinition[];
  entryPoints?: string[];
}

// ============ 执行上下文 ============
export interface ExecutionContext {
  workflowDir: string;
  outputDir: string;
  auditDir: string;
  tempBaseDir: string;
  sessionId: string;
  nodeOutputs: Map<string, any>;
  auditLog: AuditEntry[];
}

// ============ 执行状态 ============
export interface ExecutionState {
  status: 'running' | 'complete' | 'error';
  logs: string[];
  startTime: number;
  complete: boolean;
}

// ============ 审计日志条目 ============
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
