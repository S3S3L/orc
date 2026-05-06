# ORC Workflow 配置指南

本文档介绍如何使用 ORC 编排工作流。ORC 基于 JSON 配置定义有向无环图（DAG），支持 Bash、Python、Node.js、Claude Code AI 以及循环子图等多种节点类型。

---

## 1. 工作流结构

一个工作流 JSON 文件由以下部分组成：

```json
{
  "version": "1.0",
  "name": "我的工作流",
  "description": "工作流描述（可选）",
  "schemaBaseDir": ["./schemas"],
  "schemas": {},
  "nodes": [],
  "edges": []
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `version` | 是 | 工作流版本号，如 `"1.0"` |
| `name` | 是 | 工作流名称 |
| `description` | 否 | 工作流描述 |
| `schemaBaseDir` | 否 | JSON Schema 文件所在目录列表 |
| `schemas` | 否 | 内联 JSON Schema 定义 |
| `nodes` | 是 | 节点数组 |
| `edges` | 是 | 边数组，定义节点间的数据流和依赖关系 |

---

## 2. 节点定义

每个节点描述一个执行单元。所有节点共享基础结构：

```json
{
  "id": "my-node",
  "type": "bash",
  "name": "节点显示名称",
  "description": "节点描述（可选）",
  "config": { ... }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 节点唯一标识，全工作流唯一 |
| `type` | 是 | 节点类型：`bash` / `python` / `node` / `claude-code` / `loop` |
| `name` | 是 | 显示名称，用于 UI 展示 |
| `description` | 否 | 节点用途描述 |
| `config` | 是 | 各类型特有的配置，见下文 |

### 2.1 Bash 节点 (`bash`)

执行 Shell 脚本：

```json
{
  "id": "init",
  "type": "bash",
  "name": "初始化数据",
  "config": {
    "script": "./scripts/init-data.sh",
    "interpreter": "bash",
    "argsPassing": {
      "type": "stdin"
    },
    "retry": {
      "maxAttempts": 3,
      "backoff": "exponential",
      "delayMs": 1000
    }
  }
}
```

**config 字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `script` | 是 | 脚本文件路径（相对于工作流 JSON 所在目录） |
| `interpreter` | 否 | 解释器，默认使用系统 shell |
| `argsPassing.type` | 是 | 输入传递方式：`stdin` / `args` / `file` |
| `argsPassing.argMapping` | 否 | 参数映射配置（仅在 `args` 模式下使用） |
| `argsPassing.fileName` | 否 | 文件名（仅在 `file` 模式下使用） |
| `envMapping` | 否 | 环境变量映射 |
| `retry` | 否 | 重试配置（所有节点类型通用，见 [7. 重试与超时](#7-重试与超时)） |

**argsPassing 参数映射示例**（`args` 模式）：

```json
"argsPassing": {
  "type": "args",
  "argMapping": {
    "userName": {
      "type": "string",
      "position": 1
    },
    "configFile": {
      "type": "file",
      "position": 2
    }
  }
}
```

### 2.2 Python 节点 (`python`)

执行 Python 脚本：

```json
{
  "id": "merge-data",
  "type": "python",
  "name": "合并数据",
  "config": {
    "script": "./scripts/merge-data.py",
    "interpreter": "python3",
    "argsPassing": {
      "type": "stdin"
    },
    "requirements": {
      "file": "./requirements.txt",
      "packages": ["pandas", "numpy"]
    }
  }
}
```

**config 字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `script` | 是 | Python 脚本路径 |
| `interpreter` | 否 | Python 解释器，默认 `python` |
| `argsPassing` | 否 | 同 Bash 节点，默认 `stdin` |
| `requirements.file` | 否 | requirements.txt 路径 |
| `requirements.packages` | 否 | 需要 pip 安装的包列表 |

### 2.3 Node.js 节点 (`node`)

执行 JavaScript 脚本：

```json
{
  "id": "report",
  "type": "node",
  "name": "生成报告",
  "config": {
    "script": "./scripts/generate-report.js",
    "runtime": "node",
    "argsPassing": {
      "type": "stdin"
    }
  }
}
```

**config 字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `script` | 是 | JS 脚本路径 |
| `runtime` | 否 | 运行时环境：`node`（默认）/ `bun` / `deno` |
| `argsPassing` | 否 | 同 Bash 节点，默认 `stdin` |

### 2.4 Claude Code 节点 (`claude-code`)

调用 Claude AI 执行智能任务：

```json
{
  "id": "claude-analysis",
  "type": "claude-code",
  "name": "AI 数据分析",
  "config": {
    "prompt": {
      "markdown": "./prompts/analysis-report.md",
      "template": true
    },
    "inputMapping": {
      "mergedData": {
        "target": "markdown",
        "section": "DATA_SECTION"
      }
    },
    "execution": {
      "workDir": "{{nodeId}}",
      "outputFile": "analysis-output.json",
      "audit": {
        "enabled": true,
        "logStdout": true,
        "logStderr": true,
        "saveMessages": true
      }
    },
    "resume": {
      "maxAttempts": 2,
      "prompt": "上次输出未通过校验，请重新分析并确保结果包含 valid 字段",
      "validator": "output.valid === true"
    },
    "capabilities": {
      "tools": {
        "allowed": ["Read", "Bash", "Glob"]
      },
      "mcp": {
        "enabled": ["postgres"],
        "config": "./mcp-config.json"
      }
    },
    "timeout": 600000
  }
}
```

**config 字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `prompt.markdown` | 是 | Prompt 模板文件路径 |
| `prompt.template` | 否 | 是否启用 Handlebars 模板渲染（默认 `false`） |
| `inputMapping` | 否 | 将上游输入注入到 prompt 中（按 section 标记） |
| `execution.workDir` | 否 | 工作目录，支持 `{{nodeId}}` 模板变量 |
| `execution.outputFile` | 否 | 输出文件名 |
| `execution.audit` | 否 | 审计日志配置 |
| `resume.maxAttempts` | 否 | AI 重试次数 |
| `resume.prompt` | 否 | 重试时的 prompt 提示 |
| `resume.validator` | 否 | 校验表达式，参数为 `output`，返回 `true`/`false` |
| `capabilities.tools.allowed` | 否 | 允许使用的 MCP 工具列表 |
| `capabilities.tools.denied` | 否 | 禁止使用的 MCP 工具列表 |
| `capabilities.mcp` | 否 | MCP 服务器配置 |
| `timeout` | 否 | 超时时间（毫秒） |

**Handlebars 模板示例**（`prompt.template: true`）：

```markdown
# 数据分析任务

请分析以下数据并生成报告：

{{#each mergedData}}
- 用户: {{this.userName}}
- 配置: {{this.configName}}
{{/each}}
```

**inputMapping section 注入**：

当 prompt 文件包含 `<!-- SECTION: DATA_SECTION -->` 标记时，上游数据会自动以 JSON 代码块形式注入到该标记之后。

### 2.5 循环子图节点 (`loop`)

在条件满足前重复执行子图：

```json
{
  "id": "data-validation-loop",
  "type": "loop",
  "name": "数据校验循环",
  "config": {
    "subGraph": {
      "nodes": [
        {
          "id": "validate",
          "type": "bash",
          "name": "校验数据",
          "config": {
            "script": "./scripts/validate-data.sh",
            "argsPassing": { "type": "stdin" }
          }
        },
        {
          "id": "fix",
          "type": "bash",
          "name": "修复数据",
          "config": {
            "script": "./scripts/fix-data.sh",
            "argsPassing": { "type": "stdin" }
          }
        }
      ],
      "edges": [
        {
          "id": "edge-validate-to-fix",
          "from": { "nodeId": "validate" },
          "to": { "nodeId": "fix", "input": "data" }
        }
      ]
    },
    "maxAttempts": 3,
    "validator": "outputs['validate']?.valid === true"
  }
}
```

**config 字段说明：**

| 字段 | 必填 | 说明 |
|------|------|------|
| `subGraph.nodes` | 是 | 子图节点列表 |
| `subGraph.edges` | 是 | 子图边列表 |
| `maxAttempts` | 是 | 最大迭代次数 |
| `validator` | 是 | 校验表达式，参数为 `outputs`（子图所有节点输出的映射），返回 `true` 则结束循环 |

**执行逻辑：**

1. 每轮迭代使用独立的工作目录
2. 子图按 DAG 正常执行
3. 迭代完成后运行 `validator` 表达式
4. 校验通过 → 退出循环，输出子图最终结果
5. 校验失败 → 进入下一轮迭代（除非已达 `maxAttempts`）

---

## 3. 边与数据流

边定义节点之间的数据传递关系。

### 3.1 基本边

```json
{
  "id": "edge-init-to-user",
  "from": { "nodeId": "init" },
  "to": { "nodeId": "fetch-user", "input": "config" }
}
```

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 边的唯一标识 |
| `from.nodeId` | 是 | 源节点 ID |
| `to.nodeId` | 是 | 目标节点 ID |
| `to.input` | 是 | 目标节点接收数据时使用的输入名 |

**数据流语义：** 源节点执行完成后，其输出会作为 `config` 参数传递给目标节点。

### 3.2 一对多（扇出）

一个源节点可以向多个下游节点传递数据：

```json
[
  {
    "id": "edge-init-to-user",
    "from": { "nodeId": "init" },
    "to": { "nodeId": "fetch-user", "input": "config" }
  },
  {
    "id": "edge-init-to-config",
    "from": { "nodeId": "init" },
    "to": { "nodeId": "fetch-config", "input": "config" }
  }
]
```

### 3.3 多对一（扇入）

多个上游节点的输出合并到一个下游节点：

```json
[
  {
    "id": "edge-user-to-merge",
    "from": { "nodeId": "fetch-user" },
    "to": { "nodeId": "merge-data", "input": "userData" }
  },
  {
    "id": "edge-config-to-merge",
    "from": { "nodeId": "fetch-config" },
    "to": { "nodeId": "merge-data", "input": "appConfig" }
  }
]
```

`merge-data` 节点会收到 `{ "userData": { 上游输出 }, "appConfig": { 上游输出 } }`。

### 3.4 并行执行

当没有边连接的多个节点会**并行执行**。例如：

```
init → fetch-user → merge-data
init → fetch-config → merge-data
```

`fetch-user` 和 `fetch-config` 在 `init` 完成后**同时启动**，两者都完成后才执行 `merge-data`。

---

## 4. 条件分支

条件分支允许根据上游节点的执行结果动态选择执行路径。

### 4.1 基本配置

```json
{
  "id": "edge-branch",
  "from": { "nodeId": "start" },
  "to": { "nodeId": "default-path", "input": "config" },
  "condition": {
    "branches": [
      {
        "expression": "outputs['start']?.status === 'success'",
        "to": { "nodeId": "success-path", "input": "config" }
      },
      {
        "expression": "outputs['start']?.status === 'failed'",
        "to": { "nodeId": "failure-path", "input": "config" }
      }
    ],
    "onNoMatch": "skip"
  }
}
```

### 4.2 表达式编写

`expression` 是一个 JavaScript 表达式，上下文变量为 `outputs`（所有上游节点的输出映射）：

```javascript
// 基于状态判断
"outputs['start']?.status === 'success'"

// 基于输出内容判断
"outputs['check']?.hasErrors === false"

// 组合条件
"outputs['a']?.code === 0 && outputs['b']?.code === 0"

// 数值比较
"outputs['score']?.value > 80"
```

### 4.3 分支评估规则

- `branches` 按**数组顺序**依次评估
- **第一个**返回 `true` 的分支生效，后续分支不再评估
- 所有分支都不匹配时，按 `onNoMatch` 处理

### 4.4 onNoMatch 行为

| 值 | 说明 |
|----|------|
| `"skip"` | 跳过该条边，数据不传递 |
| `"skip-node"` | 跳过目标节点（不执行目标节点） |
| `"stop"` | 停止整个工作流 |
| `"error"` | 抛出错误，工作流以 error 状态结束 |
| 不设置 | 使用边的默认 `to` 目标（fallback） |

### 4.5 注意事项

- 边的 `to` 字段作为**默认目标**：无 `condition` 或 `onNoMatch` 未设置时生效
- 条件分支边中同时存在 `to` 和 `condition.branches` 时，`branches` 中的路由会覆盖默认目标

---

## 5. JSON Schema 校验

工作流支持通过 JSON Schema 对节点输入输出进行类型校验。

### 5.1 文件方式（推荐）

1. 将 Schema 文件放在 `schemaBaseDir` 指定的目录中
2. 文件名格式：`{nodeId}_out.json`（输出 Schema）

```json
{
  "schemaBaseDir": ["./schemas/complex"],
  "nodes": [
    {
      "id": "init",
      "type": "bash",
      "config": { ... }
    }
  ]
}
```

系统会自动加载 `./schemas/complex/init_out.json` 作为 `init` 节点的输出 Schema。

### 5.2 内联方式

```json
{
  "schemas": {
    "init_out": {
      "content": {
        "type": "object",
        "properties": {
          "message": { "type": "string" }
        }
      }
    }
  }
}
```

### 5.3 节点 output 引用

```json
{
  "id": "init",
  "type": "bash",
  "output": {
    "ref": "init_out"
  },
  "config": { ... }
}
```

### 5.4 下游自动继承

下游节点的 `inputs` 中声明的输入名，会自动继承上游节点对应输出的 Schema。执行时会自动校验输入数据是否符合 Schema。

---

## 6. 完整示例

以下是一个包含 Bash、Python、Loop 循环、Node.js 和 Claude Code 的完整工作流：

```json
{
  "version": "1.0",
  "name": "数据处理流水线",
  "description": "获取数据 → 合并校验 → 报告生成 + AI 分析",
  "schemaBaseDir": ["./schemas/complex"],
  "nodes": [
    {
      "id": "init",
      "type": "bash",
      "name": "初始化数据",
      "config": {
        "script": "./scripts/init-data.sh",
        "argsPassing": { "type": "stdin" }
      }
    },
    {
      "id": "fetch-user",
      "type": "bash",
      "name": "获取用户数据",
      "config": {
        "script": "./scripts/fetch-user.sh",
        "argsPassing": { "type": "stdin" }
      }
    },
    {
      "id": "fetch-config",
      "type": "bash",
      "name": "获取配置数据",
      "config": {
        "script": "./scripts/fetch-config.sh",
        "argsPassing": { "type": "stdin" }
      }
    },
    {
      "id": "merge-data",
      "type": "python",
      "name": "合并数据",
      "config": {
        "script": "./scripts/merge-data.py",
        "argsPassing": { "type": "stdin" }
      }
    },
    {
      "id": "data-validation-loop",
      "type": "loop",
      "name": "数据校验循环",
      "config": {
        "subGraph": {
          "nodes": [
            {
              "id": "validate",
              "type": "bash",
              "name": "校验数据",
              "config": {
                "script": "./scripts/validate-data.sh",
                "argsPassing": { "type": "stdin" }
              }
            },
            {
              "id": "fix",
              "type": "bash",
              "name": "修复数据",
              "config": {
                "script": "./scripts/fix-data.sh",
                "argsPassing": { "type": "stdin" }
              }
            }
          ],
          "edges": [
            {
              "id": "edge-validate-to-fix",
              "from": { "nodeId": "validate" },
              "to": { "nodeId": "fix", "input": "data" }
            }
          ]
        },
        "maxAttempts": 3,
        "validator": "outputs['validate']?.valid === true"
      }
    },
    {
      "id": "report",
      "type": "node",
      "name": "生成报告",
      "config": {
        "script": "./scripts/generate-report.js",
        "argsPassing": { "type": "stdin" }
      }
    },
    {
      "id": "claude-analysis",
      "type": "claude-code",
      "name": "AI 数据分析",
      "config": {
        "prompt": {
          "markdown": "./prompts/analysis-report.md",
          "template": true
        },
        "execution": {
          "workDir": "{{nodeId}}",
          "audit": {
            "enabled": true,
            "logStdout": true,
            "logStderr": true,
            "saveMessages": true
          }
        },
        "capabilities": {
          "tools": { "allowed": ["Read", "Bash"] }
        }
      }
    }
  ],
  "edges": [
    {
      "id": "edge-init-to-user",
      "from": { "nodeId": "init" },
      "to": { "nodeId": "fetch-user", "input": "config" }
    },
    {
      "id": "edge-init-to-config",
      "from": { "nodeId": "init" },
      "to": { "nodeId": "fetch-config", "input": "config" }
    },
    {
      "id": "edge-user-to-merge",
      "from": { "nodeId": "fetch-user" },
      "to": { "nodeId": "merge-data", "input": "userData" }
    },
    {
      "id": "edge-config-to-merge",
      "from": { "nodeId": "fetch-config" },
      "to": { "nodeId": "merge-data", "input": "appConfig" }
    },
    {
      "id": "edge-merge-to-loop",
      "from": { "nodeId": "merge-data" },
      "to": { "nodeId": "data-validation-loop", "input": "data" }
    },
    {
      "id": "edge-loop-to-report",
      "from": { "nodeId": "data-validation-loop" },
      "to": { "nodeId": "report", "input": "data" }
    },
    {
      "id": "edge-loop-to-claude",
      "from": { "nodeId": "data-validation-loop" },
      "to": { "nodeId": "claude-analysis", "input": "mergedData" }
    }
  ]
}
```

**执行流程：**

```
                    ┌── fetch-user ──┐
  init ─────────────┤                ├── merge-data ── loop ──┬── report
                    └── fetch-config ──┘                      └── claude-code
```

---

## 7. 重试与超时

所有节点类型都支持以下通用配置：

```json
{
  "config": {
    "retry": {
      "maxAttempts": 3,
      "backoff": "exponential",
      "delayMs": 1000
    },
    "timeout": 300000
  }
}
```

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `retry.maxAttempts` | `1` | 最大重试次数（含首次执行） |
| `retry.backoff` | `"exponential"` | 退避策略：`"exponential"`（指数退避）或 `"fixed"`（固定延迟） |
| `retry.delayMs` | `1000` | 初始重试延迟（毫秒） |
| `timeout` | 无 | 节点执行超时时间（毫秒） |

**指数退避示例**（`delayMs: 2000`）：

| 重试次数 | 等待时间 |
|----------|----------|
| 第 2 次 | 2 秒 |
| 第 3 次 | 4 秒 |
| 第 4 次 | 8 秒 |

---

## 8. 工作流执行

### 8.1 运行工作流

```bash
orc run <workflow.json> -o output/ -w workspace/ -a audit/
```

| 参数 | 说明 |
|------|------|
| `-o, --output` | 节点输出缓存目录 |
| `-w, --workspace` | 临时工作目录 |
| `-a, --audit` | 审计日志目录 |

### 8.2 从指定节点恢复

```bash
orc run <workflow.json> --start-from <nodeId>
```

预加载指定节点的上游缓存输出，从该节点开始继续执行。

### 8.3 验证工作流配置

```bash
orc validate <workflow.json>
```

检查 JSON 配置是否符合 Schema、图结构是否为 DAG、输入覆盖是否完整。

### 8.4 Web UI

```bash
orc serve
```

启动 Web 服务，提供 Cytoscape.js DAG 可视化、实时状态监控和节点调试功能。

---

## 9. 执行特性

### 9.1 并行执行

没有依赖关系的节点自动并行执行。工作流中的并行分组由 DAG 拓扑层级决定。

### 9.2 幂等执行

如果节点的输出文件已存在，直接加载缓存，跳过实际执行。这对于长时间运行的任务非常有用——中断后恢复时不会重复已完成的步骤。

### 9.3 节点隔离

每个节点每次执行使用独立临时目录 (`tempDir`)，避免文件冲突。

### 9.4 跳过传播

当节点被条件分支标记为跳过（`skipped`）时，下游节点会感知该状态并跳过对应的数据传递。

---

## 10. 最佳实践

### 路径约定

所有脚本、prompt、schema 文件路径都**相对于工作流 JSON 文件所在目录**。推荐使用 `./scripts/`、`./prompts/`、`./schemas/` 子目录组织文件。

### 节点 ID 命名

使用小写字母 + 连字符，如 `fetch-user-data`。ID 会在输出目录、审计日志中使用，保持简洁和可读。

### Schema 校验

建议为每个节点定义输出 Schema，这有助于：

- 在启动执行前验证工作流配置的连通性
- 运行时校验输入输出数据的正确性
- 通过 Web UI 查看类型信息

### 条件分支表达式

- 使用可选链 `?.` 防止 undefined 错误：`outputs['nodeId']?.status`
- 保持表达式简洁，避免复杂逻辑
- 复杂判断逻辑建议放到脚本内部处理

### Loop 子图

- `validator` 表达式中通过 `outputs['节点ID']` 访问子图各节点的输出
- 合理设置 `maxAttempts`，避免无限循环
- 子图内的边不需要 `condition` 配置

### 重试配置

- 网络相关任务建议 `maxAttempts: 3` + `backoff: "exponential"`
- 幂等操作可设置更高重试次数
- AI 节点建议配合 `resume` + `validator` 做结果质量保障

---

## 附录 A: 配置速查表

### 节点类型

| 类型 | script | 运行时 | 特殊能力 |
|------|--------|--------|----------|
| `bash` | Shell 脚本 | 系统 shell | envMapping、stdin/args/file |
| `python` | Python 脚本 | python / python3 | requirements 自动安装 |
| `node` | JavaScript 脚本 | node / bun / deno | 同 Node.js 生态 |
| `claude-code` | Prompt 文件 | Claude AI API | Handlebars 模板、Schema 约束输出、Resume 重试 |
| `loop` | 子图 | 嵌套子图内执行 | 动态校验、多次迭代 |

### 边条件 onNoMatch

| 值 | 行为 |
|----|------|
| `"skip"` | 跳过这条边 |
| `"skip-node"` | 跳过目标节点 |
| `"stop"` | 停止工作流 |
| `"error"` | 抛出错误 |
| 不设置 | 使用默认 `to` 目标 |

### 全局重试参数

| 参数 | 默认值 |
|------|--------|
| `retry.maxAttempts` | 1 |
| `retry.backoff` | `"exponential"` |
| `retry.delayMs` | 1000 |

---

## 附录 B: 常见问题

**Q: 如何让两个节点并行执行？**

A: 只要它们之间没有边连接，且上游节点相同（或都无上游），它们会并行执行。

**Q: 一个节点可以有多个输入吗？**

A: 可以。多个上游边可以指向同一节点的不同 `input` 名，节点会收到所有输入的合集。

**Q: 工作流可以有环吗？**

A: 不可以。工作流必须是有向无环图（DAG）。如需循环请使用 `loop` 节点类型。

**Q: 条件分支的表达式可以访问哪些变量？**

A: 只有 `outputs` 一个变量，它是所有上游节点输出的映射（`{ nodeId: output }`）。

**Q: 输出文件在哪？**

A: 位于 `{outputDir}/{sessionId}/{nodeId}.json`，每节点一个 JSON 文件。

**Q: 如何调试单个节点？**

A: 使用 `--start-from <nodeId>` 从该节点恢复执行，或通过 Web UI 点击 "Run This Node" 按钮。
