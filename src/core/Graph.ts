import Graph from 'graphology';
import { topologicalSort } from 'graphology-dag';
import Ajv from 'ajv';
import type { WorkflowDefinition, NodeDefinition, EdgeDefinition } from '../types.js';
import { WORKFLOW_SCHEMA } from '../schema.js';

export class WorkflowGraph {
  private graph: Graph;
  private nodes: Map<string, NodeDefinition> = new Map();
  private ajv: Ajv;

  constructor(workflow: WorkflowDefinition) {
    this.graph = new Graph();
    this.ajv = new Ajv({ allErrors: true });
    this.build(workflow);
  }

  private build(workflow: WorkflowDefinition): void {
    // 1. 校验工作流 Schema
    this.validateWorkflowSchema(workflow);

    // 2. 添加节点
    for (const node of workflow.nodes) {
      this.graph.addNode(node.id, node);
      this.nodes.set(node.id, node);
    }

    // 3. 添加边（包括默认 to 和 condition.branches 中的目标）
    for (const edge of workflow.edges) {
      if (!this.graph.hasNode(edge.from.nodeId)) {
        throw new Error(`Edge ${edge.id}: source node ${edge.from.nodeId} not found`);
      }

      // 添加默认的 to 边（仅当 edge.to 存在时）
      if (edge.to) {
        if (!this.graph.hasNode(edge.to.nodeId)) {
          throw new Error(`Edge ${edge.id}: target node ${edge.to.nodeId} not found`);
        }

        this.graph.addDirectedEdge(edge.from.nodeId, edge.to.nodeId, {
          input: edge.to.input,
          transform: edge.transform,
          condition: edge.condition,  // 存储条件配置
          edgeId: edge.id,  // 存储边的 ID
          isDefaultEdge: true  // 标记为默认边
        });
      }

      // 添加 condition.branches 中的边
      if (edge.condition?.branches) {
        for (const branch of edge.condition.branches) {
          if (!this.graph.hasNode(branch.to.nodeId)) {
            throw new Error(`Edge ${edge.id}: branch target node ${branch.to.nodeId} not found`);
          }

          // 检查是否已存在相同的边
          const existingEdge = this.graph.hasEdge(edge.from.nodeId, branch.to.nodeId);
          if (existingEdge) {
            // 已存在，跳过
            continue;
          }

          this.graph.addDirectedEdge(edge.from.nodeId, branch.to.nodeId, {
            input: branch.to.input,
            transform: edge.transform,
            condition: edge.condition,  // 存储条件配置
            edgeId: edge.id,  // 存储边的 ID
            branchTarget: branch.to  // 标记为分支目标
          });
        }
      }
    }

    // 4. 校验 DAG（无环）
    this.validateDAG();

    // 5. 校验 Schema 连接
    this.validateSchemaConnections(workflow.edges);
  }

  private validateWorkflowSchema(workflow: WorkflowDefinition): void {
    const validate = this.ajv.compile(WORKFLOW_SCHEMA);
    if (!validate(workflow)) {
      throw new Error(
        `Workflow schema validation failed: ${this.ajv.errorsText(validate.errors)}`
      );
    }
  }

  private validateDAG(): void {
    try {
      // graphology-dag 的 topologicalSort 函数会检查是否有环
      topologicalSort(this.graph);
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`Workflow contains cycles: ${e.message}`);
      }
      throw new Error('Workflow contains cycles');
    }
  }

  private validateSchemaConnections(edges: EdgeDefinition[]): void {
    // 按目标节点分组边（包括边的 to 和 condition.branches 中的 to）
    const edgesByTarget = new Map<string, Array<{ edge: EdgeDefinition; input: string }>>();

    for (const edge of edges) {
      // 添加边的默认 to 目标（仅当 edge.to 存在时）
      if (edge.to) {
        const defaultList = edgesByTarget.get(edge.to.nodeId) || [];
        defaultList.push({ edge, input: edge.to.input });
        edgesByTarget.set(edge.to.nodeId, defaultList);
      }

      // 添加 condition.branches 中的目标
      if (edge.condition?.branches) {
        for (const branch of edge.condition.branches) {
          const list = edgesByTarget.get(branch.to.nodeId) || [];
          list.push({ edge, input: branch.to.input });
          edgesByTarget.set(branch.to.nodeId, list);
        }
      }
    }

    // 校验每个节点的输入覆盖
    for (const [nodeId, incomingEdges] of edgesByTarget.entries()) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      const providedInputs = new Set(incomingEdges.map(e => e.input));

      // 检查节点定义中的所有输入
      for (const inputName of Object.keys(node.inputs)) {
        if (!providedInputs.has(inputName)) {
          throw new Error(
            `Node ${nodeId}: required input '${inputName}' is not provided by any edge`
          );
        }
      }
    }
  }

  /**
   * 获取拓扑排序的执行顺序
   */
  getExecutionOrder(): string[] {
    return topologicalSort(this.graph);
  }

  /**
   * 获取节点的所有输入边
   */
  getIncomingEdges(nodeId: string): Array<{ id: string; from: string; input: string; condition?: {
    branches: Array<{ expression: string; to: { nodeId: string; input: string } }>;
    onNoMatch?: 'skip' | 'skip-node' | 'stop' | 'error';
  } }> {
    const edges = this.graph
      .inEdges(nodeId)
      .map((edge: any) => {
        const attrs = this.graph.getEdgeAttributes(edge);
        return {
          id: attrs.edgeId || edge,  // 使用存储的 edgeId
          from: this.graph.source(edge)!,
          input: attrs.input,
          condition: attrs.condition
        };
      });
    return edges;
  }

  /**
   * 获取节点定义
   */
  getNode(nodeId: string): NodeDefinition | undefined {
    return this.nodes.get(nodeId);
  }

  /**
   * 获取所有节点
   */
  getAllNodes(): NodeDefinition[] {
    return Array.from(this.nodes.values());
  }

  /**
   * 获取图的大小
   */
  get size(): number {
    return this.graph.order;
  }

  /**
   * 获取并行执行组 - 将节点按层级分组，同一组内节点可并行执行
   */
  getParallelGroups(): string[][] {
    const executionOrder = topologicalSort(this.graph);
    const groups: string[][] = [];
    const nodeLevel = new Map<string, number>();

    for (const nodeId of executionOrder) {
      // 使用入边来计算层级
      const incomingEdges = this.graph.inEdges(nodeId);
      const maxPredLevel = incomingEdges.length === 0
        ? -1
        : Math.max(...incomingEdges.map((edge: any) => {
            const source = this.graph.source(edge);
            return nodeLevel.get(source!) ?? 0;
          }));

      const level = maxPredLevel + 1;
      nodeLevel.set(nodeId, level);

      if (!groups[level]) {
        groups[level] = [];
      }
      groups[level].push(nodeId);
    }

    return groups;
  }

  /**
   * 检查边是否应该执行（基于条件）- 已废弃，使用 Executor 中的条件评估
   * @deprecated 条件评估已移至 Executor.evaluateEdgeCondition()
   */
  shouldExecuteEdge(edge: EdgeDefinition): boolean {
    // 已废弃方法，不支持新的 branches 配置
    return true;
  }

  /**
   * 获取所有节点的输出（用于条件判断）
   */
  getAllNodeOutputs(): Record<string, any> {
    const outputs: Record<string, any> = {};
    for (const [nodeId] of this.nodes.entries()) {
      outputs[nodeId] = null;
    }
    return outputs;
  }

  /**
   * 设置节点输出（用于条件判断）
   */
  setNodeOutput(nodeId: string, output: any): void {
    // Placeholder for future use
  }
}
