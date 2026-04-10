# ORC 技术设计文档

## 架构概述

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI                                  │
│                      (src/cli.ts)                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Executor                                │
│                   (src/core/Executor.ts)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │   Graph     │  │   Validator │  │   Output    │         │
│  │  (DAG 管理)  │  │(Schema 校验) │  │  Manager    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  BashNode     │   │  PythonNode   │   │  NodeNode     │
└───────────────┘   └───────────────┘   └───────────────┘
        ▼
┌───────────────┐
│ ClaudeCodeNode│
└───────────────┘
```

## 核心类型

### NodeDefinition

```typescript
interface NodeDefinition {
  id: string;
  type: 'bash' | 'python' | 'node' | 'claude-code';
  name: string;
  inputs: Record<string, JSONSchema7>;  // 命名输入
  output: JSONSchema7;                   // 单个输出
  config: BashConfig | PythonConfig | NodeConfig | ClaudeCodeConfig;
}
```

### EdgeDefinition

```typescript
interface EdgeDefinition {
  id: string;
  from: { nodeId: string };
  to: { nodeId: string; input: string };
  transform?: (data: any) => any;
}
```

### ExecutionContext

```typescript
interface ExecutionContext {
  workflowDir: string;
  outputDir: string;       // 节点输出持久化
  auditDir: string;        // 审计日志持久化
  tempBaseDir: string;     // 临时目录根目录
  sessionId: string;
  nodeOutputs: Map<string, any>;
}
```

## 节点配置

### BashConfig

```typescript
interface BashConfig extends BaseNodeConfig {
  script: string;
  interpreter?: string;
  argsPassing: {
    type: 'stdin' | 'args' | 'file';
    argMapping?: Record<string, {...}>;
    fileName?: string;
  };
  envMapping?: Record<string, string>;
}
```

### PythonConfig

```typescript
interface PythonConfig extends BaseNodeConfig {
  script: string;
  interpreter?: string;
  argsPassing?: {...};
  requirements?: { file?: string; packages?: string[] };
}
```

### NodeConfig

```typescript
interface NodeConfig extends BaseNodeConfig {
  script: string;
  runtime?: string;  // node, bun, deno
  argsPassing?: {...};
}
```

### ClaudeCodeConfig

```typescript
interface ClaudeCodeConfig extends BaseNodeConfig {
  prompt: {
    markdown: string;
    template?: boolean;
  };
  inputMapping?: Record<string, {
    target: 'markdown' | 'prompt' | 'file';
    section?: string;
  }>;
  execution: {
    workDir: string;
    outputFile: string;
    audit?: AuditConfig;
  };
  capabilities: {
    tools?: { allowed?: string[]; denied?: string[] };
    mcp?: { enabled?: string[]; config?: string };
  };
  configTemplates?: ConfigTemplate[];
}
```

## 执行流程

```
1. 初始化目录 (output/, audit/, temp/)
2. 获取并行执行组 (按层级分组)
3. 对每个并行组:
   - 并行执行组内所有节点
   - 对每个节点:
     a. 创建独立临时目录
     b. 收集上游输出作为输入
     c. 评估边条件（如配置）
     d. JSON Schema 校验输入
     e. 执行节点脚本（支持重试）
     f. 处理输出 (outputMapping)
     g. JSON Schema 校验输出
     h. 持久化输出到 output/
     i. 记录审计日志到 audit/
4. 返回所有节点输出
```

### 并行执行

节点按拓扑层级分组，同一组内的节点无依赖关系，可并行执行：

```typescript
// Executor.execute()
const groups = this.graph.getParallelGroups();
for (const group of groups) {
  await Promise.all(group.map(nodeId => this.executeNode(nodeId)));
}
```

### 错误恢复（重试机制）

支持配置重试策略：

```typescript
{
  "retry": {
    "maxAttempts": 3,
    "backoff": "exponential",  // 或 'fixed'
    "delayMs": 1000
  }
}
```

### 条件分支

边可配置条件表达式，基于上游节点输出决定是否执行：

```typescript
{
  "condition": {
    "expression": "outputs['node-a']?.result === 'success'",
    "onSkip": "skip-edge"  // 或 'skip-node', 'error'
  }
}
```

## Claude Code 节点特性

### JSON Schema 约束输出

```typescript
// buildClaudeArgs 方法
const contextContent = readFileSync(contextMdPath, 'utf-8');  // 直接读取文件内容
const args = [
  '-p', contextContent,  // 直接传递内容，避免 shell 展开问题
  '--output-format', 'json',
  '--json-schema', JSON.stringify(node.output)  // 使用节点 output schema
];
```

### 结构化输出提取

```typescript
// execute 方法
const rawOutput = JSON.parse(result.stdout);
if (rawOutput.structured_output) {
  output = rawOutput.structured_output;  // 去除元数据
} else {
  output = rawOutput;
}
```

### Handlebars 模板渲染

```typescript
// renderContextMarkdown 方法
let content = await fs.readFile(promptPath, 'utf-8');

// 1. Handlebars 模板渲染
if (config.prompt.template) {
  const template = Handlebars.compile(content);
  content = template(inputs);
}

// 2. 输入数据注入（通过 <!-- SECTION: xxx --> 标记）
if (config.inputMapping) {
  for (const [inputName, mapping] of Object.entries(config.inputMapping)) {
    const sectionMarker = `<!-- SECTION: ${mapping.section} -->`;
    const inputValue = JSON.stringify(inputs[inputName], null, 2);
    content = content.replace(sectionMarker, `${sectionMarker}\n\n${inputValue}`);
  }
}
```

### 审计日志内容

```json
{
  "inputs": {...},
  "outputs": {...},
  "execution": {
    "tempDir": "...",
    "duration": 73759,
    "exitCode": 0
  },
  "persistedFiles": {
    "output": "/path/to/output.json"
  }
}
```

## 目录结构

```
orc/
├── src/
│   ├── types.ts
│   ├── schema.ts
│   ├── cli.ts
│   ├── core/
│   │   ├── Graph.ts
│   │   └── Executor.ts
│   ├── nodes/
│   │   ├── BashNode.ts
│   │   ├── PythonNode.ts
│   │   ├── NodeNode.ts
│   │   └── ClaudeCodeNode.ts
│   └── runtime/
│       └── AuditLogger.ts
├── docs/
│   ├── iteration-plan.md
│   └── technical-design.md
├── examples/
│   ├── pipeline-workflow.json
│   ├── pipeline-with-claude.json
│   └── scripts/
└── package.json
```

## 依赖

```json
{
  "ajv": "^8.18.0",
  "graphology": "^0.26.0",
  "graphology-dag": "^0.4.1",
  "handlebars": "^4.7.9",
  "commander": "^14.0.3",
  "uuid": "^13.0.0",
  "execa": "^8.0.1"
}
```

## 审计日志格式

```json
{
  "id": "node-id-timestamp",
  "timestamp": "2026-04-10T10:00:00Z",
  "nodeId": "node-id",
  "phase": "complete",
  "inputs": { ... },
  "outputs": { ... },
  "execution": {
    "tempDir": "/path/to/temp",
    "duration": 1234,
    "exitCode": 0,
    "stdout": "...",
    "stderr": "..."
  },
  "persistedFiles": {
    "output": "/path/to/output.json"
  }
}
```
