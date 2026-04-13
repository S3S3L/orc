import { JSONSchema7 } from 'json-schema';

// ============ 节点类型枚举 ============
export type NodeType = 'bash' | 'python' | 'node' | 'claude-code';

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

// ============ 边定义 ============
export interface EdgeDefinition {
  id: string;
  from: { nodeId: string };
  to: { nodeId: string; input: string };
  transform?: (data: any) => any;
  condition?: {
    expression: string;      // 条件表达式，基于上游输出
    /**
     * 条件不满足时的行为
     * - 'skip': 跳过这条边
     * - 'skip-node': 跳过目标节点
     * - 'stop': 停止工作流执行
     * - 'error': 抛出错误
     */
    onFalse?: 'skip' | 'skip-node' | 'stop' | 'error';
    /**
     * 动态路由：条件为真时路由到的目标
     * 支持多个分支，类似 switch/case
     */
    branches?: Array<{
      expression: string;     // 分支条件
      to: { nodeId: string; input: string };  // 路由目标
    }>;
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

// ============ 审计日志条目 ============
export interface AuditEntry {
  id: string;
  timestamp: string;
  nodeId: string;
  phase: 'start' | 'validate' | 'execute' | 'complete' | 'error' | 'retry' | 'skipped';
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
