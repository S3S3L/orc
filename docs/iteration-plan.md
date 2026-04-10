# ORC 迭代计划

## 项目概述

ORC (Orchestration Runner) - JSON 驱动的任务编排工具

### 核心特性
- DAG 工作流定义和执行
- JSON Schema 输入输出校验
- 支持 bash/python/node/claude-code 节点
- 统一审计日志和输出管理
- Claude Code 原生 JSON 输出（--output-format json, --json-schema）

## 迭代计划

### v0.1.0 - 基础框架 (2026-04-10) ✅

**目标**: 最小可运行的类型系统和执行引擎

**任务**:
- [x] 实现 `src/types.ts` - 完整类型定义
- [x] 实现 `src/schema.ts` - JSON Schema 校验
- [x] 实现 `src/core/Graph.ts` - 图构建和 DAG 校验
- [x] 实现 `src/runtime/AuditLogger.ts` - 审计日志
- [x] 实现 `src/core/Executor.ts` - 执行引擎框架

**验证**:
- [x] `tsc --noEmit` 通过
- [x] 单元测试：DAG 校验
- [x] 单元测试：输入 Schema 校验

### v0.2.0 - Bash/Python/Node 节点 ✅

**目标**: 支持脚本执行节点

**任务**:
- [x] 实现 `src/nodes/BashNode.ts`
- [x] 实现 `src/nodes/PythonNode.ts`
- [x] 实现 `src/nodes/NodeNode.ts`

**验证**:
- [x] 集成测试：bash 节点执行并返回 JSON
- [x] 集成测试：python 节点执行并返回 JSON
- [x] 集成测试：node 节点执行并返回 JSON
- [x] 集成测试：节点间 JSON 数据传递

### v0.3.0 - Claude Code 节点 ✅

**目标**: 支持 Claude Code 集成

**任务**:
- [x] 实现 `src/nodes/ClaudeCodeNode.ts`
- [x] 实现模板引擎 (Handlebars)
- [x] 实现输入映射
- [x] 实现配置文件模板渲染
- [x] 实现工作目录隔离

**验证**:
- [x] 集成测试：Claude Code 节点执行
- [x] 集成测试：模板渲染正确性
- [x] 集成测试：审计日志包含完整对话

### v0.4.0 - CLI 和完整工作流 ✅

**目标**: 命令行工具和完整工作流执行

**任务**:
- [x] 实现 `src/cli.ts`
- [x] 实现目录初始化
- [x] 实现临时目录清理
- [x] 实现输出持久化

**验证**:
- [x] E2E 测试：完整工作流执行
- [x] 验证输出文件正确写入
- [x] 验证审计日志完整

### v0.5.0 - 高级特性 ✅

**目标**: 增强功能

**任务**:
- [x] 输入转换脚本支持
- [x] 输出转换脚本支持
- [x] Claude Code 原生 JSON 输出（--output-format json）
- [x] JSON Schema 约束（--json-schema）
- [x] structured_output 自动提取

**验证**:
- [x] E2E 测试：含 Claude Code 节点的完整工作流

### v0.6.0 - 并行执行、错误恢复、条件分支、Web UI ✅

**目标**: 增强功能和性能优化

**任务**:
- [x] 并行执行优化（独立分支并行）
  - 实现 `getParallelGroups()` 方法，按层级分组节点
  - 修改 `Executor.execute()` 使用 `Promise.all()` 并行执行同组节点
- [x] 错误恢复和重试机制
  - 添加 `RetryConfig` 配置（maxAttempts, backoff, delayMs）
  - 实现指数退避策略
  - 添加重试审计日志
- [x] 条件分支支持
  - 在 `EdgeDefinition` 中添加 `condition` 字段
  - 实现 `evaluateEdgeCondition()` 方法进行条件求值
  - 支持 `skip-edge`, `skip-node`, `error` 三种跳过行为
- [x] Web UI 可视化
  - 使用 Cytoscape.js 可视化 DAG
  - 实现节点状态实时更新
  - 提供执行日志查看器
  - 添加 `serve` 命令启动 Web 服务器

**验证**:
- [x] 编译通过 `tsc`
- [x] CLI 新增 `serve` 命令
- [x] 并行组计算正确
- [x] 条件边评估功能正常

## 技术决策记录

### 决策 1: TypeScript + Node.js

**日期**: 2026-04-10

**决策**: 使用 TypeScript + Node.js 作为实现语言

**理由**:
- JSON 原生支持
- 跨平台执行
- 成熟的生态 (json-schema, graphology)
- 类型安全

### 决策 2: 临时目录隔离

**日期**: 2026-04-10

**决策**: 每个节点执行使用独立临时目录

**理由**:
- 避免节点间干扰
- 安全清理
- 审计追踪

### 决策 3: 统一 JSON 输入输出

**日期**: 2026-04-10

**决策**: 所有节点统一使用 JSON 输入输出

**理由**:
- 统一校验
- 简化管理
- 方便数据流追踪

### 决策 4: Claude Code 原生 JSON 输出

**日期**: 2026-04-10

**决策**: 使用 `--output-format json` 和 `--json-schema` 进行结构化输出

**理由**:
- 无需解析 markdown 代码块
- Schema 约束确保输出格式正确
- 自动去除元数据（duration, usage, cost）
