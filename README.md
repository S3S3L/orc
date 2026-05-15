# ORC — Orchestration Runner

JSON 驱动的任务编排工具，基于 DAG 工作流定义，支持 Web UI 和 CLI 两种使用方式。

## 特性

- **DAG 工作流**: 基于有向无环图的工作流定义和执行
- **条件分支**: 支持基于表达式的条件路由（Aviator 引擎）
- **循环子图**: 内嵌子图循环 + validator 校验
- **多语言节点**: Bash、Python、Node.js、Claude Code、Loop 节点
- **Web UI**: React + MUI + Cytoscape 可视化界面，实时进度展示
- **REST API**: 完整的会话管理、节点详情、Loop 子图查询
- **审计日志**: 完整的执行审计和输出持久化
- **幂等执行**: 节点输出缓存，支持断点续跑

## 快速开始

### 环境要求

- Java 21+
- Maven 3.6+
- Node.js 仅需首次构建时安装（frontend-maven-plugin 自动管理）

### 构建

```bash
cd orc-java && mvn package -DskipTests
```

> `mvn package` 会自动构建前端（React + Vite）并嵌入 JAR，无需手动操作。

### 运行工作流

```bash
./scripts/start.sh MODE=run WORKFLOW=examples/simple-pipeline.json
# 或直接运行
java -jar orc-java/target/orc-java-0.8.0-SNAPSHOT.jar run --workflow examples/simple-pipeline.json
```

### 启动 Web UI

```bash
./scripts/start.sh                           # serve 模式，默认端口 30080
# 或
SERVER_PORT=8080 ./scripts/start.sh
```

然后访问 `http://localhost:30080` 使用内置 React 前端。

### 启动脚本

| 命令 | 说明 |
|------|------|
| `./scripts/start.sh` | 启动 serve 模式 |
| `MODE=run WORKFLOW=xxx ./scripts/start.sh` | 启动 run 模式（执行完自动退出） |
| `./scripts/stop.sh` | 停止服务 |
| `./scripts/restart.sh` | 重启服务 |

环境变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `MODE` | `serve` | `serve`（Web UI）或 `run`（执行工作流） |
| `SERVER_PORT` | `30080` | HTTP 端口 |
| `WORKFLOW` | — | 工作流文件路径（run 模式必填） |
| `OUTPUT` | `./output` | 节点输出目录 |
| `WORKSPACE` | `./workspace` | 临时工作目录 |
| `AUDIT` | `./audit` | 审计日志目录 |

## 工作流定义

```json
{
  "version": "1.0",
  "name": "示例工作流",
  "nodes": [
    {
      "id": "node1",
      "type": "bash",
      "name": "节点 1",
      "config": {
        "script": "./scripts/node1.sh",
        "argsPassing": { "type": "stdin" }
      }
    },
    {
      "id": "node2",
      "type": "python",
      "name": "节点 2",
      "config": {
        "script": "./scripts/node2.py",
        "argsPassing": { "type": "stdin" }
      }
    }
  ],
  "edges": [
    {
      "id": "edge1",
      "from": { "nodeId": "node1" },
      "to": { "nodeId": "node2", "input": "data" }
    }
  ]
}
```

### 节点类型

| 类型 | 说明 |
|------|------|
| `bash` | Shell 脚本执行 |
| `python` | Python 脚本执行 |
| `node` | JavaScript 脚本执行（通过 Node.js 子进程） |
| `claude-code` | Claude CLI 集成 |
| `loop` | 循环子图 |

### 参数传递方式

| 方式 | 说明 |
|------|------|
| `stdin` | 上游输出 JSON 通过标准输入传递 |
| `args` | 作为命令行参数传递 |
| `file` | 写入临时文件，文件路径作为参数 |

## 项目结构

```
orc/
├── scripts/              # 启动脚本
│   ├── start.sh
│   ├── stop.sh
│   └── restart.sh
├── frontend/             # React 前端（Vite + MUI + Cytoscape）
├── orc-java/             # Java 后端（Spring Boot 3.3.5）
│   ├── pom.xml
│   └── src/
├── examples/             # 示例工作流
├── output/               # 节点输出（运行时生成）
├── workspace/            # 临时目录（运行时生成）
└── audit/                # 审计日志（运行时生成）
```

## CLI 命令

### run — 执行工作流

```bash
java -jar orc-java/target/orc-java-0.8.0-SNAPSHOT.jar run \
  --workflow examples/simple-pipeline.json \
  --output ./output --workspace ./workspace --audit ./audit
```

### validate — 校验工作流定义

```bash
java -jar orc-java/target/orc-java-0.8.0-SNAPSHOT.jar validate \
  --workflow examples/simple-pipeline.json
```

### serve — 启动 Web 服务

```bash
java -jar orc-java/target/orc-java-0.8.0-SNAPSHOT.jar serve \
  --workflow examples/simple-pipeline.json --port 30080
```

> **注意**: Spring Shell 3.x 要求命令和选项之间用空格分隔，不支持 `=` 号形式。

## REST API

默认端口 `30080`。

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/v1/workflow` | 获取当前工作流定义 |
| `GET` | `/api/v1/sessions` | 获取所有会话历史 |
| `POST` | `/api/v1/sessions` | 启动新工作流执行 |
| `GET` | `/api/v1/sessions/{id}/status` | 查询会话状态 |
| `POST` | `/api/v1/sessions/{id}/rerun` | 重新执行会话 |
| `GET` | `/api/v1/nodes/{id}` | 获取节点详情 |
| `POST` | `/api/v1/nodes/{id}/run` | 从指定节点开始执行 |
| `GET` | `/api/v1/loops/{nodeId}/subgraph` | 获取循环子图定义 |

## 开发

### 仅开发前端

```bash
cd frontend && npm install && npm run dev
```

前端 dev server 在 5173 端口，自动代理 `/api/*` 到 Java 后端（30080）。

### 完整构建

```bash
cd orc-java && mvn clean package -DskipTests
```

## 许可证

ISC
