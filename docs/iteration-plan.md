# ORC 迭代计划

## 项目概述

ORC (Orchestration Runner) - JSON 驱动的任务编排工具

### 核心特性
- DAG 工作流定义和执行
- JSON Schema 输入输出校验
- 5 种节点类型：bash / python / node / claude-code / loop
- 并行执行（根节点并行 + 下游传播）
- 条件分支（branches 统一配置）
- 节点重试（指数退避）
- 幂等执行（输出缓存）
- Web UI 可视化（Cytoscape.js）
- Claude Code 原生 JSON 输出（--output-format json, --json-schema）
- Claude 对话导出（ConversationExporter）

## 迭代进度

### v0.1.0 - 基础框架 (2026-04-10) ✅

**目标**: 最小可运行的类型系统和执行引擎

- [x] `src/types.ts` - 完整类型定义
- [x] `src/schema.ts` - JSON Schema 校验
- [x] `src/core/Graph.ts` - 图构建和 DAG 校验
- [x] `src/runtime/AuditLogger.ts` - 审计日志
- [x] `src/core/Executor.ts` - 执行引擎框架

### v0.2.0 - Bash/Python/Node 节点 ✅

**目标**: 支持脚本执行节点

- [x] `src/nodes/BashNode.ts`
- [x] `src/nodes/PythonNode.ts`
- [x] `src/nodes/NodeNode.ts`

### v0.3.0 - Claude Code 节点 ✅

**目标**: 支持 Claude Code 集成

- [x] `src/nodes/ClaudeCodeNode.ts`
- [x] Handlebars 模板渲染
- [x] 输入映射（inputMapping）
- [x] 工作目录隔离

### v0.4.0 - CLI 和完整工作流 ✅

**目标**: 命令行工具和完整工作流执行

- [x] `src/cli.ts`（run / validate 命令）
- [x] 目录初始化
- [x] 输出持久化
- [x] 审计日志

### v0.5.0 - 高级特性 ✅

**目标**: 增强功能

- [x] 输入/输出转换脚本支持
- [x] Claude Code 原生 JSON 输出（--output-format json）
- [x] JSON Schema 约束（--json-schema）
- [x] structured_output 自动提取

### v0.6.0 - 并行执行 + 重试 + 条件分支 + Web UI ✅

**目标**: 增强功能和性能优化

- [x] 并行执行（根节点 Promise.all + 下游传播触发）
- [x] 错误恢复和重试机制（maxAttempts / backoff / delayMs）
- [x] 条件分支（branches 统一配置 + onNoMatch）
- [x] LoopNode（循环子图 + validator 动态校验）
- [x] Web UI（Cytoscape DAG 可视化 + 状态轮询 + serve 命令）
- [x] 幂等执行（输出文件缓存复用）
- [x] startFrom 调试恢复模式
- [x] Claude 对话导出（ConversationExporter + ClaudeExporterWorker）
- [x] 孤立节点自动跳过
- [x] GlobalContext 全局状态管理

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
- 自动去除元数据

### 决策 5: 事件驱动传播（v0.6.0）

**日期**: 2026-04

**决策**: 并行执行采用根节点 Promise.all + 下游传播，而非全局分组调度

**理由**:
- 更自然的依赖触发模型
- 节点级 Mutex 保证安全
- 支持 startFrom 调试模式
- 避免全局等待瓶颈

### 决策 6: branches 统一条件配置（v0.6.1）

**日期**: 2026-04

**决策**: 所有条件判断统一为 `condition.branches` 配置，边默认 `to` 作为 fallback

**理由**:
- 一致的动态路由语义
- 支持多分支路由
- onNoMatch 提供灵活的无匹配处理

## 已知问题

1. **CLI 版本号**: `cli.ts` 中 `.version('0.1.0')` 与 `package.json` 的 `0.6.0` 不同步
2. **测试源码缺失**: `test/` 目录不存在，仅有 `dist/test/*.js` 编译产物
3. **条件求值安全**: 使用 `new Function('outputs', ...)` 动态编译表达式，存在注入风险
