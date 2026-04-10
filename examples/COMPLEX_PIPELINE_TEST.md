# 复杂工作流测试

## 工作流结构

```
                    ┌──────────────┐
                    │    init      │
                    │  (bash 节点)  │
                    │              │
                    │ 输出：        │
                    │ - baseUrl    │
                    │ - apiKey     │
                    │ - timestamp  │
                    └──────┬───────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
         ▼                                   ▼
┌─────────────────┐                 ┌─────────────────┐
│   fetch-user    │                 │  fetch-config   │
│   (bash 节点)    │                 │   (bash 节点)    │
│                 │                 │                 │
│ 输出：           │                 │ 输出：           │
│ - userId        │                 │ - maxRetries    │
│ - userName      │                 │ - timeout       │
│ - email         │                 │ - featureFlags  │
└────────┬────────┘                 └────────┬────────┘
         │                                   │
         │                                   │
         └─────────────────┬─────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   merge-data    │
                  │   (python 节点)  │
                  │                 │
                  │ 输入：           │
                  │ - userData      │ ← 来自 fetch-user
                  │ - appConfig     │ ← 来自 fetch-config
                  │                 │
                  │ 输出：           │
                  │ - merged        │
                  │ - summary       │
                  │ - itemCount     │
                  └────────┬────────┘
                           │
         ┌─────────────────┴─────────────────┐
         │                                   │
         ▼                                   ▼
┌─────────────────┐                 ┌─────────────────┐
│     report      │                 │ claude-analysis │
│   (node 节点)    │                 │ (claude-code 节点)│
│                 │                 │                 │
│ 输入：           │                 │ 输入：           │
│ - data          │ ← merge-data    │ - mergedData    │ ← merge-data
│                 │                 │                 │
│ 输出：           │                 │ 输出：           │
│ - reportId      │                 │ - analysis      │
│ - status        │                 │ - keyFindings   │
│ - generatedAt   │                 │ - recommendations│
│                 │                 │ - riskLevel     │
│                 │                 │ - confidence    │
└─────────────────┘                 └─────────────────┘
```

## 验证的功能点

### 1. 一对多输出（One-to-Many）
`init` 节点的输出同时传递给两个下游节点：
- `fetch-user` (通过 `config` 输入)
- `fetch-config` (通过 `config` 输入)

```json
"edges": [
  { "from": { "nodeId": "init" }, "to": { "nodeId": "fetch-user", "input": "config" } },
  { "from": { "nodeId": "init" }, "to": { "nodeId": "fetch-config", "input": "config" } }
]
```

### 2. 多对一输入（Many-to-One）
`merge-data` 节点接收两个上游节点的独立输出：
- `userData` ← `fetch-user` 的输出
- `appConfig` ← `fetch-config` 的输出

```json
"edges": [
  { "from": { "nodeId": "fetch-user" }, "to": { "nodeId": "merge-data", "input": "userData" } },
  { "from": { "nodeId": "fetch-config" }, "to": { "nodeId": "merge-data", "input": "appConfig" } }
]
```

### 3. 并行分支（Parallel Branches）
`merge-data` 的输出同时传递给两个独立的下游节点：
- `report` (node 节点，生成简单报告)
- `claude-analysis` (Claude Code 节点，AI 智能分析)

```json
"edges": [
  { "from": { "nodeId": "merge-data" }, "to": { "nodeId": "report", "input": "data" } },
  { "from": { "nodeId": "merge-data" }, "to": { "nodeId": "claude-analysis", "input": "mergedData" } }
]
```

### 4. Claude Code 节点特性
- **Handlebars 模板渲染**: prompt markdown 支持模板语法
- **输入数据注入**: 通过 `<!-- SECTION: input -->` 标记注入输入数据
- **JSON Schema 约束**: 使用 `--json-schema` 强制输出格式
- **原生 JSON 输出**: 使用 `--output-format json` 获取结构化输出
- **自动提取**: 从 `structured_output` 字段提取业务数据，去除元数据

## 运行测试

```bash
# 正常环境运行（需要 unset CLAUDECODE 如果在 Claude Code 会话中）
unset CLAUDECODE
npm run orc -- run examples/complex-pipeline.json -o output/complex -w workspace/complex --audit audit/complex
```

## 预期结果

### 6 个节点全部成功执行

1. **init**: 生成基础配置数据
2. **fetch-user**: 使用配置获取用户信息
3. **fetch-config**: 使用配置获取应用配置
4. **merge-data**: 合并两个上游节点的输出
5. **report**: 生成简单报告
6. **claude-analysis**: AI 智能分析报告

### 数据流验证

**init → fetch-user, fetch-config (一对多)**
```
init 输出 → config 输入 → fetch-user
init 输出 → config 输入 → fetch-config
```

**fetch-user + fetch-config → merge-data (多对一)**
```
merge-data 输入:
{
  "userData": { ... },    // 来自 fetch-user
  "appConfig": { ... }    // 来自 fetch-config
}
```

**merge-data → report, claude-analysis (并行分支)**
```
merge-data 输出 → data 输入 → report
merge-data 输出 → mergedData 输入 → claude-analysis
```

### Claude Analysis 输出示例

```json
{
  "analysis": "数据表明这是一个已合并的测试用户记录...",
  "keyFindings": [
    "用户 test-user 处于已合并状态",
    "配置了 3 个功能标志",
    "包含 6 个数据项目"
  ],
  "recommendations": [
    "建议验证合并操作是否完成所有必要的数据迁移",
    "检查 3 个功能标志的具体配置是否符合预期",
    "确认 6 个项目数据的完整性和一致性"
  ],
  "riskLevel": "low",
  "confidence": 0.85
}
```

## 注意事项

1. **CLAUDECODE 环境变量**: 如果在 Claude Code 会话中运行测试，需要先 `unset CLAUDECODE`，否则会提示 "Cannot launch nested session"
2. **工作目录**: Claude Code 节点使用 `{{nodeId}}` 作为工作目录，会被解析到 output 目录下
3. **审计日志**: Claude Code 节点的审计日志包含完整的执行信息和 API 响应元数据
