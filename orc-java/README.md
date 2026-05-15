# ORC-Java 使用文档

ORC（Orchestration）是一个基于 DAG 的工作流编排引擎，支持多种节点类型、条件分支、循环子图、并行执行和 REST API 控制。

## 快速开始

### 环境要求

- Java 21+（使用虚拟线程）
- Maven 3.6+
- Python 3（用于 python 类型节点）
- Node.js（用于 node 类型节点）

### 构建

```bash
cd orc-java
mvn package -DskipTests
```

### 运行工作流

```bash
java -jar target/orc-java-0.8.0-SNAPSHOT.jar run --workflow examples/simple-pipeline.json
```

> **注意**: Spring Shell 3.x 要求命令和选项之间用空格分隔，不支持 `=` 号形式。
> 正确: `run --workflow path/to/file.json`
> 错误: `--spring.shell.command=run --workflow=path/to/file.json`

### 启动 Web UI 服务

```bash
java -jar target/orc-java-0.8.0-SNAPSHOT.jar serve --workflow examples/simple-pipeline.json --port 30080
```

然后访问 `http://localhost:30080` 使用内置 React 前端界面（SPA 已嵌入 JAR）。

### 启动脚本

项目提供了便捷的启动脚本（位于项目根目录的 `scripts/`）：

```bash
cd .. && ./scripts/start.sh                          # 启动 serve 模式（默认）
cd .. && MODE=run WORKFLOW=xxx ./scripts/start.sh    # 启动 run 模式（执行完自动退出）
cd .. && ./scripts/stop.sh                           # 停止服务
cd .. && ./scripts/restart.sh                        # 重启服务（保留 MODE/WORKFLOW）
```

或者直接在项目根目录运行：

```bash
./scripts/start.sh
MODE=run WORKFLOW=xxx ./scripts/start.sh
./scripts/stop.sh
./scripts/restart.sh
```

环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MODE` | `serve` | `serve`（Web UI）或 `run`（执行工作流） |
| `SERVER_PORT` | `30080` | HTTP 端口 |
| `WORKFLOW` | — | 工作流文件路径（run 模式必填） |
| `OUTPUT` | `./output` | 节点输出目录 |
| `WORKSPACE` | `./workspace` | 临时工作目录 |
| `AUDIT` | `./audit` | 审计日志目录 |

通过环境变量覆盖端口：`SERVER_PORT=8080 ./scripts/start.sh`

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    ORC-Java                          │
├──────────────┬──────────────────────────────────────┤
│   CLI 层     │  Spring Shell (@ShellMethod)          │
│              │  run / validate / serve               │
├──────────────┼──────────────────────────────────────┤
│   REST 层    │  Spring Boot 3.3.5 + Virtual Threads  │
│              │  /api/v1/workflow                     │
│              │  /api/v1/sessions                     │
│              │  /api/v1/nodes                        │
│              │  /api/v1/loops                        │
├──────────────┼──────────────────────────────────────┤
│   执行引擎   │  WorkflowGraph (JGraphT DAG)          │
│              │  Executor (yggdrasil-promise)         │
│              │  ConditionEvaluator (Aviator)         │
├──────────────┼──────────────────────────────────────┤
│   节点层     │  BashNodeExecutor (Commons Exec)      │
│              │  PythonNodeExecutor                   │
│              │  NodeNodeExecutor                     │
│              │  ClaudeCodeNodeExecutor               │
│              │  LoopNodeExecutor                     │
└──────────────┴──────────────────────────────────────┘
```

## 工作流定义 (workflow.json)

### 顶层结构

```json
{
  "version": "1.0",
  "name": "我的工作流",
  "description": "工作流描述",
  "nodes": [ ... ],
  "edges": [ ... ]
}
```

可选字段：`schemaBaseDir`（JSON Schema 校验目录）、`schemas`（内联 Schema）。

### 节点定义

```json
{
  "id": "my-node",
  "type": "bash",
  "name": "节点名称",
  "description": "节点描述",
  "config": {
    "script": "./scripts/my-script.sh",
    "argsPassing": { "type": "stdin" }
  }
}
```

**支持的节点类型：**

| 类型 | 说明 | 配置字段 |
|------|------|---------|
| `bash` | Shell 脚本执行 | `script`, `interpreter`（默认 `bash`） |
| `python` | Python 脚本执行 | `script`, `interpreter`（默认 `python3`） |
| `node` | JavaScript 脚本执行 | `script`, `runtime`（默认 `node`） |
| `claude-code` | Claude CLI 集成 | `prompt.markdown`, `execution.workDir`, `execution.outputFile`, `execution.audit` |
| `loop` | 循环子图执行 | `subGraph`, `maxAttempts`, `validator` |

**参数传递方式（argsPassing.type）：**

| 方式 | 说明 |
|------|------|
| `stdin` | 上游输出 JSON 通过标准输入传递 |
| `args` | 作为命令行参数传递 |
| `file` | 写入临时文件，文件路径作为参数 |

### 边定义

**无条件边：**

```json
{
  "id": "edge-a-to-b",
  "from": { "nodeId": "a" },
  "to": { "nodeId": "b", "input": "data" }
}
```

**条件分支边：**

```json
{
  "id": "edge-conditional",
  "from": { "nodeId": "process" },
  "condition": {
    "branches": [
      { "expression": "outputs.process.status == 'success'", "to": { "nodeId": "success-handler" } },
      { "expression": "outputs.process.status == 'failure'", "to": { "nodeId": "failure-handler" } }
    ],
    "onNoMatch": "default"
  },
  "to": { "nodeId": "default-handler" }
}
```

**条件表达式语法** 使用 Aviator 表达式引擎：
- 访问节点输出：`outputs.nodeId.field`
- 比较：`==`, `!=`, `>`, `<`, `>=`, `<=`
- 布尔运算：`&&`, `||`, `!`
- **注意：** 使用 `==` 而非 `===`，不支持可选链 `?.`

### 循环子图

```json
{
  "id": "my-loop",
  "type": "loop",
  "config": {
    "subGraph": {
      "nodes": [
        { "id": "validate", "type": "bash", "config": { ... } },
        { "id": "fix", "type": "bash", "config": { ... } }
      ],
      "edges": [
        { "id": "v-to-f", "from": { "nodeId": "validate" }, "to": { "nodeId": "fix", "input": "data" } }
      ]
    },
    "maxAttempts": 3,
    "validator": "outputs.validate.valid == true"
  }
}
```

- `maxAttempts`：最大重试次数
- `validator`：Aviator 表达式，返回 `true` 则循环成功退出
- 子图内节点可使用 `outputs['nodeId']` 的等价形式 `outputs.nodeId`

### 重试配置

节点级别重试（在 config 中配置）：

```json
{
  "config": {
    "retry": {
      "maxAttempts": 3,
      "backoff": "exponential",
      "delayMs": 1000
    }
  }
}
```

## CLI 命令

### run — 执行工作流

```bash
java -jar target/orc-java-0.8.0-SNAPSHOT.jar run \
  --workflow examples/simple-pipeline.json \
  --output ./output \
  --workspace ./workspace \
  --audit ./audit \
  --sessionId my-session-001 \
  --cleanOldFiles false
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--workflow` | （必填） | 工作流 JSON 文件路径 |
| `--output` | `./output` | 节点输出目录 |
| `--workspace` | `./workspace` | 临时工作目录 |
| `--audit` | `./audit` | 审计日志目录 |
| `--sessionId` | UUID | 会话 ID |
| `--cleanOldFiles` | `false` | 是否清理旧输出文件 |
| `--nodeId` | null | 从指定节点开始执行（恢复执行） |
| `--single` | `false` | 仅执行指定节点，不触发下游 |

> **提示**: 选项使用空格分隔（`--workflow xxx`），不使用等号（`--workflow=xxx`）。

### validate — 校验工作流定义

```bash
java -jar target/orc-java-0.8.0-SNAPSHOT.jar validate --workflow examples/simple-pipeline.json
```

输出：
```
Workflow is valid
  Nodes: 5
  Execution order: init -> process -> success -> failure -> final
```

### serve — 启动 Web 服务

```bash
java -jar target/orc-java-0.8.0-SNAPSHOT.jar serve \
  --workflow examples/simple-pipeline.json \
  --port 30080 \
  --output ./output \
  --workspace ./workspace \
  --audit ./audit
```

前端静态资源已嵌入 JAR 内，无需额外配置。通过 Web 界面可选择并加载工作流。

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--workflow` | null | 可选，预加载工作流文件 |
| `--port` | `3000` | HTTP 端口 |
| `--output` | `./output` | 输出目录 |
| `--workspace` | `./workspace` | 临时工作目录 |
| `--audit` | `./audit` | 审计日志目录 |

## REST API

默认端口 `30080`。

### Workflow

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/workflow` | 获取当前加载的工作流定义 |

### Session

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/sessions` | 获取所有会话历史 |
| `POST` | `/api/v1/sessions` | 启动新的工作流执行 |
| `GET` | `/api/v1/sessions/{id}/status` | 查询会话状态和节点进度 |
| `POST` | `/api/v1/sessions/{id}/rerun` | 重新执行会话（清理旧输出） |

启动执行：
```bash
curl -X POST 'http://localhost:30080/api/v1/sessions' \
  -d 'cleanOldFiles=false'
# 响应: {"sessionId": "uuid..."}
```

查询状态：
```bash
curl 'http://localhost:30080/api/v1/sessions/{sessionId}/status'
# 响应: {"status": "running", "logs": [...], "nodes": [...], ...}
```

### Node

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/nodes/{id}` | 获取节点详情 |
| `POST` | `/api/v1/nodes/{id}/run` | 从指定节点开始执行 |
| `GET` | `/api/v1/nodes/{id}/claude-html` | 获取 Claude 节点的 HTML 报告 |

从指定节点执行：
```bash
curl -X POST 'http://localhost:30080/api/v1/nodes/process/run' \
  -d 'single=true&sessionId=my-session'
# single=true 只执行该节点，不触发下游
```

### Loop

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/loops/{nodeId}/subgraph` | 获取循环节点的子图定义 |

## 执行模型

### 并行执行

- 根节点并行启动（`Promise.all`）
- 下游节点在所有上游依赖满足后触发
- 多对一输入：多个上游输出合并为下游节点的输入 map

### 条件分支

- 条件边评估所有分支，匹配的执行，未匹配的标记为 skipped
- 跳过的分支所对应的下游节点会将该依赖标记为已满足
- `onNoMatch: default` 时，无分支匹配则执行 `to` 指定的默认目标

### 幂等执行

- 节点输出持久化为 JSON 文件
- 输出文件存在时直接加载，跳过实际执行
- `cleanOldFiles=true` 时清除旧输出重新执行

### 审计日志

每个节点执行生成审计条目，包含：
- 执行时间戳
- 输入/输出数据
- 重试记录
- 持久化文件路径
- 错误信息

## 项目结构

```
orc/                              # 项目根目录
├── scripts/                      # 启动脚本
│   ├── start.sh
│   ├── stop.sh
│   └── restart.sh
├── frontend/                     # React 前端（Vite + MUI + Cytoscape）
├── orc-java/                     # 本模块
│   ├── pom.xml
│   ├── src/main/java/com/orc/
│   │   ├── OrcApplication.java
│   │   ├── core/                 # 核心引擎
│   │   ├── model/                # 数据模型
│   │   ├── nodes/                # 节点执行器
│   │   ├── server/               # REST API
│   │   ├── shell/                # CLI 命令
│   │   └── util/                 # 工具类
│   └── src/main/resources/
│       ├── application.yml
│       └── graph-schema.json
├── examples/                     # 示例工作流
└── output/, workspace/, audit/   # 运行时目录
```

## 构建说明

```bash
cd orc-java && mvn clean package -DskipTests
```

`mvn package` 会自动完成：
1. 安装 Node.js 到 `target/`（仅首次）
2. 构建前端（`npm install` + `npm run build`）
3. 将前端产物复制到 JAR 静态资源
4. 打包 Spring Boot 可执行 JAR

前端开发时可单独运行：
```bash
cd frontend && npx vite dev --port 5173
```

## 已知注意事项

1. **Spring Shell 3.x**: 选项必须空格分隔（`--workflow path`），不支持等号（`--workflow=path`）；`run` 是位置参数
2. **Aviator 表达式**: 使用 `==` 而非 `===`，使用点号访问 `outputs.nodeId.field` 而非 `outputs['nodeId']`（Aviator 不支持单引号 map 访问）
3. **脚本执行**: 所有脚本执行器（bash/python/node）始终将脚本文件作为首参数传递给解释器，stdin 仅用于数据传递
4. **循环子图**: validator 表达式中使用 `outputs.nodeId` 点号形式访问子图内节点输出
5. **幂等缓存**: 节点输出文件存在时跳过执行，重新执行需 `cleanOldFiles=true` 或手动删除输出目录
6. **前端构建**: `mvn package` 自动构建前端并嵌入 JAR，无需手动复制。前端 dev 开发时单独运行 `cd frontend && npx vite dev`
