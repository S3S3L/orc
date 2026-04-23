# ORC 技术设计文档

## 架构概述

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI Layer                                │
│                      (src/cli.ts)                                │
│  ┌─────────────────┬─────────────────┬─────────────────────┐    │
│  │ run 命令        │ validate 命令   │ serve 命令 (Web UI) │    │
│  └────────┬────────┴────────┬────────┴──────────┬──────────┘    │
└───────────┼──────────────────┼───────────────────┼───────────────┘
            │                  │                   │
┌───────────▼──────────────────▼───────────────────▼───────────────┐
│                      Core Layer                                   │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  WorkflowGraph (Graph.ts)      Executor (Executor.ts)    │    │
│  │  - DAG 构建与验证               - 节点调度与执行            │    │
│  │  - 拓扑排序                     - 条件分支评估              │    │
│  │  - 并行组计算                   - 重试机制 (指数退避)        │    │
│  │  - 输入覆盖校验                 - 幂等执行 (输出缓存)        │    │
│  │                              - startFrom 调试恢复          │    │
│  └──────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────────────┐
│                      Node Layer                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │
│  │ BashNode   │  │ PythonNode │  │ NodeNode   │  │LoopNode    │  │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │  ClaudeCodeNode (含 ConversationExporter / Worker)       │    │
│  └──────────────────────────────────────────────────────────┘    │
└───────────────────────────────────────────────────────────────────┘
            │
┌───────────▼──────────────────────────────────────────────────────┐
│                      Runtime Layer                                │
│  ┌────────────────────┐  ┌────────────────────────────────────┐  │
│  │ AuditLogger        │  │ GlobalContext (Web UI 状态)        │  │
│  │ types.ts / schema.ts │  │ ClaudeExporterWorker (后台线程)   │  │
│  └────────────────────┘  └────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────┘
```

## 核心类型

### NodeType
```typescript
export type NodeType = 'bash' | 'python' | 'node' | 'claude-code' | 'loop';
export type NodeStatus = 'pending' | 'running' | 'success' | 'failed' | 'skipped';
```

### NodeDefinition
```typescript
interface NodeDefinition {
  id: string;
  type: NodeType;
  name: string;
  description?: string;
  inputs: Record<string, JSONSchema7>;
  output: { ref: string; schema: JSONSchema7 };
  config: NodeConfigUnion;
}
```

### NodeInstance (运行时状态)
```typescript
interface NodeInstance {
  definition: NodeDefinition;
  status: NodeStatus;
  lock: Mutex;           // 节点级并发控制
  depends: Map<string, boolean>;  // 上游节点完成状态
}
```

### EdgeDefinition
```typescript
interface EdgeDefinition {
  id: string;
  from: { nodeId: string };
  to: { nodeId: string; input: string };  // 默认目标
  condition?: {
    branches: Array<{
      expression: string;
      to: { nodeId: string; input: string };
    }>;
    onNoMatch?: 'skip' | 'skip-node' | 'stop' | 'error';
  };
}
```

### ExecutionContext
```typescript
interface ExecutionContext {
  workflowDef: WorkflowDefinition;
  workflowDir: string;
  outputDir: string;
  auditDir: string;
  tempBaseDir: string;
  sessionId: string;
  nodeOutputs: Map<string, any>;
  auditLog: AuditEntry[];
  debug: NodeDebuggingContext;  // { startNodeId?, single? }
  cleanOldFiles: boolean;
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
    argMapping?: Record<string, {
      type: 'string' | 'file' | 'raw';
      position?: number;
      template?: string;
    }>;
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
  argsPassing?: { type: 'stdin' | 'args' | 'file'; ... };
  requirements?: { file?: string; packages?: string[] };
}
```

### NodeConfig
```typescript
interface NodeConfig extends BaseNodeConfig {
  script: string;
  runtime?: string;  // node, bun, deno
  argsPassing?: { type: 'stdin' | 'args' | 'file'; ... };
}
```

### ClaudeCodeConfig
```typescript
interface ClaudeCodeConfig extends BaseNodeConfig {
  prompt: { markdown: string; template?: boolean };
  inputMapping?: Record<string, { target: 'markdown'; section?: string; filePath?: string }>;
  execution: { audit?: AuditConfig };
  resume?: ClaudeCodeResumeConfig;  // maxAttempts + validator
  capabilities: {
    tools?: { allowed?: string[]; denied?: string[] };
    enableSkills?: boolean;
    mcp?: { enabled?: string[]; config?: string };
  };
}
```

### LoopConfig
```typescript
interface LoopConfig extends BaseNodeConfig {
  subGraph: GraphDefinition;       // 嵌套子图
  maxAttempts: number;             // 最大迭代次数
  validator: string;               // 动态校验表达式
}
```

## 执行流程

```
1. 加载工作流 JSON，解析为 WorkflowDefinition
2. 构建 WorkflowGraph (Graph.ts)
   a. 加载 Schema 文件 (schemaBaseDir + schemas)
   b. 添加节点到图
   c. 添加边 (默认 to + condition.branches)
   d. Schema 校验
   e. DAG 校验 (拓扑排序检测环)
   f. 输入覆盖校验
3. 创建 ExecutionContext
4. 创建 Executor，注册所有 NodeExecutor
5. 执行:
   - 全量模式: 初始化所有 NodeInstance，并行启动根节点
   - 调试模式: 从指定 startNodeId 开始，预加载上游缓存
6. 事件驱动传播:
   - 根节点 Promise.all 并行启动
   - 节点成功后 Promise.all 触发所有下游
   - 节点通过 Mutex 保证不重复执行
   - 依赖未满足时等待 (从文件加载缓存输出)
```

### 并行执行模型

```typescript
// Executor.execute(): 两种模式
if (!debugContext.startNodeId) {
  await this.newExecute(context, state);     // 全量执行
} else {
  await this.startFrom(context, state, nodeId, single);  // 调试恢复
}

// newExecute: 初始化所有节点，并行启动根节点
this.graph.getAllValidNodes().forEach(id => this.initNodeInstance(id));
await Promise.all(this.graph.getRootNodes().map(id =>
  this.executeNode(id, 'root', context, state)
));

// executeNode 成功后触发下游
node.status = 'success';
await Promise.all(this.graph.getDirectDownstreamNodes(nodeId).map(id =>
  this.executeNode(id, nodeId, context, state)
)).catch(() => {});
```

### 幂等执行（输出缓存）

```typescript
// executeNodeInternal 第一步：检查输出文件
const outputFilePath = this.getOutputFilePath(nodeId);
try {
  await this.loadFromFile(outputFilePath, nodeId, auditEntry);
  return;  // 缓存命中，直接返回
} catch { /* 文件不存在，继续正常执行 */ }
```

### 错误恢复（重试机制）

```typescript
// 每节点独立重试配置
const retryConfig = node.definition.config.retry ?? {};
const maxAttempts = retryConfig.maxAttempts ?? 1;
const backoff = retryConfig.backoff ?? 'exponential';
const baseDelay = retryConfig.delayMs ?? 1000;

for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  try {
    await this.executeNodeInternal(...);
    node.status = 'success';
    return;
  } catch (error) {
    if (error instanceof NodeSkippedError) { /* 不重试 */ }
    if (attempt < maxAttempts) {
      const delay = backoff === 'exponential'
        ? baseDelay * Math.pow(2, attempt - 1)
        : baseDelay;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### 条件分支

```typescript
// evaluateEdgeCondition: 评估 branches，返回路由决策
for (const branch of branches) {
  const branchFn = new Function('outputs', `return ${branch.expression}`);
  const result = branchFn(Object.fromEntries(this.context.nodeOutputs));
  if (!!result) return { action: 'route', target: branch.to };
}
// 无匹配时根据 onNoMatch 处理
switch (onNoMatch) {
  case 'skip': return { action: 'skip' };
  case 'skip-node': return { action: 'skip-node' };
  case 'stop': return { action: 'stop' };
  case 'error': return { action: 'error' };
  default: return { action: 'continue' };
}
```

## Claude Code 节点特性

### JSON Schema 约束输出
```typescript
// buildClaudeArgs
const args = [
  '-p', contextContent,           // 直接传递文件内容，避免 shell 展开
  '--output-format', 'json',
  '--json-schema', JSON.stringify(outputSchema),
  '--session-id', claudeCodeSessionId,
];
// 工具限制
if (allowedTools.length > 0) args.push('--allowed-tools', allowedTools.join(','));
```

### 结构化输出提取
```typescript
const rawOutput = JSON.parse(result.stdout);
if (rawOutput.structured_output) {
  output = rawOutput.structured_output;  // 自动提取，去除元数据
} else {
  output = rawOutput;
}
```

### Resume 重试
```typescript
// resume 机制：validator 校验失败后重新执行
for (let attempt = 1; attempt <= (config.resume?.maxAttempts || 0) + 1; attempt++) {
  if (resume && attempt > 1) content = resume.prompt;
  args.push('-r', claudeCodeSessionId);  // 重试时追加 -r 恢复会话
  // ... 执行 claude CLI ...
  if (validator(output) === true) return output;
}
```

### Handlebars 模板渲染
```typescript
// renderContextMarkdown: 1) Handlebars 模板  2) SECTION 注入
if (config.prompt.template) {
  content = Handlebars.compile(content)(inputs);
}
if (config.inputMapping) {
  for (const [inputName, mapping] of Object.entries(config.inputMapping)) {
    const marker = `<!-- SECTION: ${mapping.section} -->`;
    content = content.replace(marker, `${marker}\n\n\`\`\`json\n${JSON.stringify(inputs[inputName])}\n\`\`\``);
  }
}
```

### 对话导出（ClaudeExporterWorker）
- 后台 Worker 线程每 5 秒轮询
- 通过 ConversationExporter 将 `.jsonl` 对话文件导出为 HTML
- 支持 subagent 内联显示（按 agentId 或时间戳匹配）

## LoopNode 子图执行

```typescript
// LoopNode 将父图节点 + subGraph 节点合并构建新 WorkflowGraph
const graph = new WorkflowGraph({
  nodes: [...workflowDef.nodes, ...config.subGraph.nodes],
  edges: config.subGraph.edges,
  schemas: { ...workflowDef.schemas, ...config.subGraph.schemas }
}, context.workflowDir);

// 每次迭代使用独立目录
for (let attempt = 1; attempt <= maxAttempts; attempt++) {
  const subContext = {
    ...context,
    outputDir: `${outputDir}/${nodeId}-${attempt}`,
    auditDir: `${auditDir}/${nodeId}-${attempt}`,
    tempBaseDir: `${tempBaseDir}/${nodeId}-${attempt}`,
    nodeOutputs: new Map()
  };
  const executor = new Executor(graph, subContext, {
    ...inputs,
    __lastIterationOutput: lastOutputs  // 传递上次迭代输出
  });
  await executor.execute(subContext, subExecutionState);

  const validator = new Function('outputs', `return ${config.validator}`);
  if (validator(Object.fromEntries(subContext.nodeOutputs))) {
    return lastOutputs;  // 校验通过
  }
}
throw new Error(`All ${maxAttempts} attempts failed validation`);
```

## Web UI (serve 命令)

### API 端点
| 端点 | 方法 | 功能 |
|------|------|------|
| `/` | GET | 返回 index.html (Cytoscape DAG 可视化) |
| `/api/workflow` | GET | 返回 lastWorkflow JSON |
| `/api/run` | POST | 后台执行工作流，返回 sessionId |
| `/api/node/run` | POST | 单节点调试执行 (?nodeId=&single=) |
| `/api/status/:sessionId` | GET | 返回执行状态 (nodes + logs) |

### 状态管理
```typescript
// GlobalContext 单例
class GlobalContext {
  lastWorkflow: WorkflowDefinition | null = null;
  executionStates = new Map<string, ExecutionState>();  // sessionId → state
  executions = new Map<string, Executor>();              // sessionId → executor
}
```

### Web UI 功能
- Cytoscape.js DAG 可视化（按节点类型着色: bash=蓝, python=橙, node=绿, claude-code=紫）
- 节点状态实时更新（pending/running/success/failed/skipped）
- 侧边栏节点列表 + 点击查看详情
- 执行日志查看器（state.logs 轮询）
- 支持条件分支边可视化（虚线标记）

## 目录结构

```
orc/
├── src/
│   ├── cli.ts                 # CLI 入口 (run/validate/serve)
│   ├── types.ts               # 完整类型定义
│   ├── schema.ts              # JSON Schema (GRAPH_SCHEMA / WORKFLOW_SCHEMA)
│   ├── core/
│   │   ├── Graph.ts           # WorkflowGraph - DAG 管理
│   │   └── Executor.ts        # Executor - 执行引擎 + NodeSkippedError
│   ├── nodes/
│   │   ├── BashNode.ts        # Bash 执行器
│   │   ├── PythonNode.ts      # Python 执行器
│   │   ├── NodeNode.ts        # Node.js 执行器
│   │   ├── ClaudeCodeNode.ts  # Claude Code AI 节点
│   │   └── LoopNode.ts        # 循环子图节点
│   ├── runtime/
│   │   └── AuditLogger.ts     # 审计日志
│   ├── tools/
│   │   ├── ConversationExporter.ts  # 对话 HTML 导出
│   │   └── ClaudeExporterWorker.ts  # 后台 Worker 线程
│   ├── utils/
│   │   └── GlobalContext.ts   # Web UI 全局状态
│   └── web/
│       └── index.html         # Cytoscape Web UI
├── examples/
│   ├── complex-pipeline.json  # 复杂工作流示例
│   ├── prompts/               # Claude Code prompt 模板
│   ├── schemas/               # JSON Schema 文件
│   └── scripts/               # 脚本文件
├── docs/
│   ├── technical-design.md    # 本文档
│   ├── iteration-plan.md      # 迭代计划
│   ├── CODE_LOGIC.md          # 代码逻辑详细说明
│   └── V0.6.0-*.md            # 版本特性文档
├── audit/                     # 审计日志输出
├── output/                    # 节点输出缓存
├── workspace/                 # 临时工作目录
├── dist/                      # 编译产物
├── package.json               # 版本 0.6.0
└── tsconfig.json              # ES2021, CommonJS
```

## 依赖

```json
{
  "ajv": "^8.18.0",              // JSON Schema 校验
  "async-mutex": "^0.5.0",       // 并发控制
  "commander": "^14.0.3",        // CLI 命令解析
  "execa": "^8.0.1",             // 子进程执行
  "graphology": "^0.26.0",       // 图数据结构
  "graphology-dag": "^0.4.1",    // DAG 校验与拓扑排序
  "handlebars": "^4.7.9",        // 模板引擎
  "uuid": "^13.0.0",             // Session ID 生成
  "@types/json-schema": "^7.0.15"
}
```

## 审计日志格式

```json
{
  "id": "nodeId-timestamp",
  "timestamp": "2026-04-23T10:00:00Z",
  "nodeId": "node-id",
  "phase": "complete",
  "inputs": { ... },
  "outputs": { ... },
  "execution": {
    "tempDir": "/path/to/temp",
    "duration": 1234,
    "exitCode": 0
  },
  "retry": { "attempt": 1, "maxAttempts": 3, "delay": 1000 },
  "persistedFiles": { "output": "/path/to/output.json" },
  "error": "error message"
}
```

## 关键设计决策

1. **幂等执行**: 输出文件存在时直接加载缓存，避免重复计算
2. **事件驱动传播**: 根节点并行 + 下游 Promise.all 触发，非全局分组调度
3. **节点级 Mutex**: 每个 NodeInstance 独立 Mutex，防止并发竞态
4. **输出持久化**: 每节点 JSON 输出保存到 `output/sessionId/nodeId.json`
5. **调试模式**: `startFrom(nodeId)` 支持从指定节点恢复，预加载上游缓存
