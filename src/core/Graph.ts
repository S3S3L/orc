import Graph from 'graphology';
import { topologicalSort } from 'graphology-dag';
import Ajv from 'ajv';
import type { NodeDefinition, EdgeDefinition, SchemaDefinition, GraphDefinition } from '../types.js';
import { GRAPH_SCHEMA } from '../schema.js';
import path from 'path';
import fs from 'fs';

export class WorkflowGraph {
  private graph: Graph;
  private nodes: Map<string, NodeDefinition> = new Map();
  private ajv: Ajv;
  private graphDir: string;

  constructor(graphDef: GraphDefinition, graphDir: string) {
    this.graph = new Graph();
    this.ajv = new Ajv({ allErrors: true });
    this.graphDir = graphDir;
    if (!graphDef.schemas) {
      graphDef.schemas = {};
    }
    this.prepareSchema(graphDef, graphDir);

    this.build(graphDef);
  }

  private prepareSchema(schemaDef: SchemaDefinition, graphDir: string) {
    for (const dir of schemaDef.schemaBaseDir || []) {
      const entries = fs.readdirSync(path.resolve(graphDir, dir), { withFileTypes: true, encoding: 'utf-8' });
      entries.forEach(file => {
        if (file.isFile() && file.name.endsWith('.json')) {
          try {
            const schemaPath = path.resolve(graphDir, dir, file.name);
            const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
            const fileNameWithoutExt = path.parse(file.name).name;
            schemaDef.schemas[fileNameWithoutExt] = { file: path.join(dir, file.name), content: schemaContent };
          } catch (e) {
            throw new Error(`Failed to load schema file ${file.name}: ${e instanceof Error ? e.message : e}`);
          }
        }
      });
    }

    // Preload and parse all schema files
    for (const [, schema] of Object.entries(schemaDef.schemas || {})) {
      if (schema.file) {
        const schemaPath = path.resolve(this.graphDir, schema.file);
        schema.content = JSON.parse(fs.readFileSync(schemaPath, 'utf-8'));
      }
    }
  }

  private build(graphDef: GraphDefinition): void {

    // 1. Add nodes
    for (const node of graphDef.nodes) {
      if (!node.output) {
        node.output = {
          schema: {},
          ref: `${node.id}_out`
        };
      }
      node.output.schema = graphDef.schemas[node.output.ref]?.content || node.output.schema;
      if (!node.inputs) {
        node.inputs = {};
      }
      this.graph.addNode(node.id, node);
      this.nodes.set(node.id, node);
    }

    // 2. Add edges, including default `to` targets and `condition.branches` targets
    for (const edge of graphDef.edges) {
      if (!this.graph.hasNode(edge.from.nodeId)) {
        throw new Error(`Edge ${edge.id}: source node ${edge.from.nodeId} not found`);
      }

      // Add the default `to` edge when `edge.to` exists
      if (edge.to) {
        if (!this.graph.hasNode(edge.to.nodeId)) {
          throw new Error(`Edge ${edge.id}: target node ${edge.to.nodeId} not found`);
        }

        this.graph.addDirectedEdge(edge.from.nodeId, edge.to.nodeId, {
          input: edge.to.input,
          transform: edge.transform,
          condition: edge.condition,  // Store condition config
          edgeId: edge.id,  // Store edge ID
          isDefaultEdge: true  // Mark as a default edge
        });

        this.nodes.get(edge.to.nodeId)!.inputs[edge.to.input] = this.nodes.get(edge.from.nodeId)!.output.schema;
      }

      // Add edges for `condition.branches`
      if (edge.condition?.branches) {
        for (const branch of edge.condition.branches) {
          if (!this.graph.hasNode(branch.to.nodeId)) {
            throw new Error(`Edge ${edge.id}: branch target node ${branch.to.nodeId} not found`);
          }

          // Check whether the same edge already exists
          const existingEdge = this.graph.hasEdge(edge.from.nodeId, branch.to.nodeId);
          if (existingEdge) {
            // Already exists, skip it
            continue;
          }

          this.graph.addDirectedEdge(edge.from.nodeId, branch.to.nodeId, {
            input: branch.to.input,
            transform: edge.transform,
            condition: edge.condition,  // Store condition config
            edgeId: edge.id,  // Store edge ID
            branchTarget: branch.to  // Mark as a branch target
          });
        }
      }
    }
    // 3. Validate graph schema
    this.validateGraphSchema(graphDef);

    // 4. Validate DAG (acyclic)
    this.validateDAG();

    // 5. Validate schema connections
    this.validateSchemaConnections(graphDef.edges);
  }

  private validateGraphSchema(graphDef: GraphDefinition): void {
    const validate = this.ajv.compile(GRAPH_SCHEMA);
    if (!validate(graphDef)) {
      throw new Error(
        `Graph schema validation failed: ${this.ajv.errorsText(validate.errors)}`
      );
    }
  }

  private validateDAG(): void {
    try {
      // graphology-dag's topologicalSort also validates that the graph is acyclic
      topologicalSort(this.graph);
    } catch (e) {
      if (e instanceof Error) {
        throw new Error(`Graph contains cycles: ${e.message}`);
      }
      throw new Error('Graph contains cycles');
    }
  }

  private validateSchemaConnections(edges: EdgeDefinition[]): void {
    // Group edges by target node, including both `to` and `condition.branches` targets
    const edgesByTarget = new Map<string, Array<{ edge: EdgeDefinition; input: string }>>();

    for (const edge of edges) {
      // Add default `to` target when `edge.to` exists
      if (edge.to) {
        const defaultList = edgesByTarget.get(edge.to.nodeId) || [];
        defaultList.push({ edge, input: edge.to.input });
        edgesByTarget.set(edge.to.nodeId, defaultList);
      }

      // Add targets from `condition.branches`
      if (edge.condition?.branches) {
        for (const branch of edge.condition.branches) {
          const list = edgesByTarget.get(branch.to.nodeId) || [];
          list.push({ edge, input: branch.to.input });
          edgesByTarget.set(branch.to.nodeId, list);
        }
      }
    }

    // Validate input coverage for each node
    for (const [nodeId, incomingEdges] of edgesByTarget.entries()) {
      const node = this.nodes.get(nodeId);
      if (!node) continue;

      const providedInputs = new Set(incomingEdges.map(e => e.input));

      // Check all inputs defined on the node
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
  * Get topological execution order
   */
  getExecutionOrder(): string[] {
    return topologicalSort(this.graph);
  }

  /**
  * Get all incoming edges for a node
   */
  getIncomingEdges(nodeId: string): Array<{
    id: string; from: string; input: string; condition?: {
      branches: Array<{ expression: string; to: { nodeId: string; input: string } }>;
      onNoMatch?: 'skip' | 'skip-node' | 'stop' | 'error';
    }
  }> {
    const edges = this.graph
      .inEdges(nodeId)
      .map((edge: any) => {
        const attrs = this.graph.getEdgeAttributes(edge);
        return {
          id: attrs.edgeId || edge,  // Use stored edgeId
          from: this.graph.source(edge)!,
          input: attrs.input,
          condition: attrs.condition
        };
      });
    return edges;
  }

  /**
  * Get node definition
   */
  getNode(nodeId: string): NodeDefinition | undefined {
    return this.nodes.get(nodeId);
  }

  /**
  * Get all nodes
   */
  getAllNodes(): NodeDefinition[] {
    return Array.from(this.nodes.values());
  }

  /**
  * Get graph size
   */
  get size(): number {
    return this.graph.order;
  }

  /**
  * Get parallel execution groups by level. Nodes in the same group can run in parallel.
   */
  getParallelGroups(): string[][] {
    const executionOrder = topologicalSort(this.graph);
    const groups: string[][] = [];
    const nodeLevel = new Map<string, number>();

    for (const nodeId of executionOrder) {
      // Use incoming edges to compute node level
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
  * Get outputs for all nodes (for condition evaluation)
   */
  getAllNodeOutputs(): Record<string, any> {
    const outputs: Record<string, any> = {};
    for (const [nodeId] of this.nodes.entries()) {
      outputs[nodeId] = null;
    }
    return outputs;
  }

  /**
  * Set node output (reserved for condition evaluation)
   */
  setNodeOutput(nodeId: string, output: any): void {
    // Placeholder for future use
  }

  getRootNodes(): string[] {
    return this.graph
      .nodes()
      .filter((nodeId: string) => this.graph.inDegree(nodeId) === 0 && this.graph.outDegree(nodeId) > 0);
  }

  getDirectUpstreamNodes(nodeId: string): string[] {
    return this.graph
      .inNeighbors(nodeId);
  }

  getDirectDownstreamNodes(nodeId: string): string[] {
    return this.graph
      .outNeighbors(nodeId);
  }

  getAllDownstreamNodes(nodeId: string): string[] {
    const visited = new Set<string>();
    const stack = [nodeId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (!visited.has(current)) {
        visited.add(current);
        const neighbors = this.graph.outNeighbors(current);
        stack.push(...neighbors);
      }
    }

    visited.delete(nodeId); // Remove the starting node itself
    return Array.from(visited);
  }

  getAllValidNodes(): string[] {
    return this.graph
      .nodes()
      .filter((nodeId: string) => this.graph.inDegree(nodeId) > 0 || this.graph.outDegree(nodeId) > 0);
  }
}
