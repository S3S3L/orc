# ORC - Orchestration Runner

JSON 驱动的任务编排工具，支持 DAG 工作流定义和执行。

## 特性

- **DAG 工作流**: 基于有向无环图的工作流定义和执行
- **JSON Schema 校验**: 所有节点输入输出使用 JSON Schema 定义和校验
- **多语言支持**: 支持 Bash、Python、Node.js 和 Claude Code 节点
- **审计日志**: 完整的执行审计和输出持久化
- **临时目录隔离**: 每个节点执行使用独立临时目录

## 安装

```bash
npm install
npm run build
```

## 使用

### 验证工作流

```bash
npm run orc -- validate workflow.json
```

### 执行工作流

```bash
npm run orc -- run workflow.json -o output -w workspace --audit audit
```

### CLI 选项

```
orc run <workflow>    执行工作流
  -o, --output <dir>      输出目录 (默认：./output)
  -w, --workspace <dir>   临时工作目录 (默认：./workspace)
  --audit <dir>           审计日志目录 (默认：./audit)
  -v, --verbose           详细输出

orc validate <workflow>   验证工作流定义
```

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
      "inputs": {},
      "output": { "type": "object" },
      "config": {
        "script": "./scripts/node1.sh",
        "argsPassing": { "type": "stdin" }
      }
    },
    {
      "id": "node2",
      "type": "python",
      "name": "节点 2",
      "inputs": {
        "data": { "type": "object" }
      },
      "output": { "type": "object" },
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

## 节点类型

### Bash 节点

```json
{
  "type": "bash",
  "config": {
    "script": "./script.sh",
    "argsPassing": {
      "type": "stdin"
    },
    "envMapping": {
      "API_KEY": "apiKey"
    }
  }
}
```

### Python 节点

```json
{
  "type": "python",
  "config": {
    "script": "./script.py",
    "argsPassing": {
      "type": "stdin"
    },
    "requirements": {
      "packages": ["requests", "numpy"]
    }
  }
}
```

### Node 节点

```json
{
  "type": "node",
  "config": {
    "script": "./script.js",
    "argsPassing": {
      "type": "stdin"
    }
  }
}
```

### Claude Code 节点

```json
{
  "type": "claude-code",
  "config": {
    "prompt": {
      "markdown": "./prompts/task.md",
      "template": true
    },
    "inputMapping": {
      "data": { "target": "markdown", "section": "input" }
    },
    "execution": {
      "workDir": "{{nodeId}}",
      "outputFile": "output.json",
      "audit": { "enabled": true, "saveMessages": true }
    },
    "capabilities": {
      "tools": { "allowed": ["Read", "Bash", "Write"] }
    }
  }
}
```

**特性：**
- 自动使用节点 `output` 的 JSON Schema 约束输出格式（通过 `--json-schema`）
- 支持 Handlebars 模板渲染上下文 Markdown
- 支持输入数据注入到 Markdown 指定位置
- 审计日志记录完整执行信息和 Claude 会话元数据

## 示例

查看 `examples/` 目录中的示例工作流：

```bash
# 运行示例工作流
npm run orc -- run examples/pipeline-workflow.json
```

## 许可证

ISC
