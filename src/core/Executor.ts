import Ajv from 'ajv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { WorkflowGraph } from './Graph.js';
import { AuditLogger } from '../runtime/AuditLogger.js';
import type { ExecutionContext, NodeDefinition, NodeType, NodeInstance, ExecutionState } from '../types.js';
import { BashNode } from '../nodes/BashNode.js';
import { PythonNode } from '../nodes/PythonNode.js';
import { NodeNode } from '../nodes/NodeNode.js';
import { ClaudeCodeNode } from '../nodes/ClaudeCodeNode.js';
import { LoopNode } from '../nodes/LoopNode.js';
import { Mutex, E_CANCELED } from 'async-mutex';

const DEFAULT_MAX_RETRY_ATTEMPTS = 1;
const DEFAULT_RETRY_BACKOFF = 'exponential';
const DEFAULT_RETRY_DELAY_MS = 1000;

// Node executor interface
export interface NodeExecutor {
  execute(
    node: NodeDefinition,
    inputs: Record<string, any>,
    context: ExecutionContext
  ): Promise<any>;
}

// Special error type: node was skipped
export class NodeSkippedError extends Error {
  constructor(nodeId: string) {
    super(`Node ${nodeId}: skipped due to condition`);
    this.name = 'NodeSkippedError';
  }
}

export class Executor {
  private graph: WorkflowGraph;
  private ajv: Ajv;
  private audit: AuditLogger;
  private context: ExecutionContext;
  private executors: Map<string, NodeExecutor> = new Map();
  private workflowStopped: boolean = false;  // Workflow stop flag
  private nodes: Map<string, NodeInstance> = new Map();  // Node instance state, including execution status
  private startInputs: Record<string, any>;

  constructor(
    graph: WorkflowGraph,
    context: ExecutionContext,
    startInputs: Record<string, any> = {}
  ) {
    this.graph = graph;
    this.context = context;
    this.startInputs = startInputs;
    this.ajv = new Ajv({ allErrors: true });
    this.audit = new AuditLogger(context.auditDir);
    this.registerExecutor('bash', new BashNode());
    this.registerExecutor('python', new PythonNode());
    this.registerExecutor('node', new NodeNode());
    this.registerExecutor('claude-code', new ClaudeCodeNode());
    this.registerExecutor('loop', new LoopNode());
  }

  /**
  * Register a node executor
   */
  registerExecutor(type: NodeType, executor: NodeExecutor): void {
    this.executors.set(type, executor);
  }

  getNodes(): Map<string, NodeInstance> {
    return this.nodes;
  }

  /**
  * Execute the workflow
   */
  async execute(context: ExecutionContext, state: ExecutionState): Promise<Map<string, any>> {
    const debugContext = context.debug;
    if (!debugContext.startNodeId) {
      await this.newExecute(context, state);
    } else {
      await this.startFrom(context, state, debugContext.startNodeId, debugContext.single ?? false);
    }

    return this.context.nodeOutputs;
  }

  private async startFrom(context: ExecutionContext, state: ExecutionState, startNodeId: string, single: boolean): Promise<void> {
    this.graph.getAllDownstreamNodes(startNodeId).forEach(nodeId => {
      this.initNodeInstance(nodeId);
    });

    const node = this.initNodeInstance(startNodeId);

    await Promise.all(this.graph.getDirectUpstreamNodes(startNodeId).map(async upstreamId => {
      const tempDir = await this.createTempDir(context, upstreamId);

      const auditEntry = this.audit.start(upstreamId, { tempDir });
      await this.loadFromFile(this.getOutputFilePath(upstreamId), upstreamId, auditEntry)
        .then(() => {
          console.log(`[${new Date().toISOString()}] [${context.sessionId}] Preloaded output for upstream node ${upstreamId} before starting from ${startNodeId}`);
          node.depends.set(upstreamId, true); // Mark dependency as satisfied
        })
        .catch(() => {
          console.log(`[${new Date().toISOString()}] [${context.sessionId}] Upstream node ${upstreamId} output not found, skipping cache load`);
        }); // Preload upstream outputs so dependency state is correct
    }));

    console.log(`[${new Date().toISOString()}] [${context.sessionId}] Starting workflow execution from node ${startNodeId}`);

    await this.executeNode(startNodeId, 'root', context, state, single);
  }

  private initNodeInstance(nodeId: string): NodeInstance {
    const nodeDef = this.graph.getNode(nodeId);
    if (nodeDef) {
      const node: NodeInstance = {
        definition: nodeDef,
        status: 'pending',
        lock: new Mutex(),  // Initialize mutex for this node
        depends: new Map() // Track dependency state: upstream node ID -> completion flag
      };
      this.nodes.set(nodeId, node);
      this.graph.getDirectUpstreamNodes(nodeId).forEach(upstreamId => {
        node.depends.set(upstreamId, false);
      });

      return node;
    }

    throw new Error(`Node definition not found for nodeId: ${nodeId}`);
  }

  /**
  * Execute the workflow from the beginning. If an output file exists, reuse it directly.
   * @param context 
   * @param state 
   */
  private async newExecute(context: ExecutionContext, state: ExecutionState) {
    // Initialize directories
    await this.initializeDirectories();

    this.graph.getAllValidNodes().forEach(nodeId => {
      this.initNodeInstance(nodeId);
    });

    console.log(`[${new Date().toISOString()}] [${context.sessionId}] Starting workflow execution with ${this.nodes.size} nodes`);

    await Promise.all(this.graph.getRootNodes().map(rootNodeId => this.executeNode(rootNodeId, 'root', context, state)));
  }

  /**
  * Initialize directories
   */
  private async initializeDirectories(): Promise<void> {
    await fs.mkdir(this.context.outputDir, { recursive: true });
    await fs.mkdir(this.context.auditDir, { recursive: true });
    await fs.mkdir(this.context.tempBaseDir, { recursive: true });
  }

  /**
  * Execute a single node with retry support
   */
  private async executeNode(nodeId: string, from: string, context: ExecutionContext, state: ExecutionState, single?: boolean): Promise<void> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node ${nodeId} not found`);
    }

    if (node.lock.isLocked()) {
      console.log(`[${new Date().toISOString()}] [${context.sessionId}] Node ${nodeId} is already locked, skipping execution`);
      return;
    }

    return node.lock.runExclusive(async () => {
      if (node.status !== 'pending') {
        console.log(`[${new Date().toISOString()}] [${context.sessionId}] Node ${nodeId} is already ${node.status}, skipping execution`);
        return;
      }

      node.depends.set(from, true);

      // Create a unique temp directory for this execution
      const tempDir = await this.createTempDir(context, nodeId);

      const auditEntry = this.audit.start(nodeId, { tempDir });

      for (const [dependId, completed] of node.depends.entries()) {
        if (completed) {
          continue;
        }

        // try load dependency output from file, if exists, to satisfy dependency and allow execution to proceed
        try {
          await this.loadFromFile(this.getOutputFilePath(dependId), dependId, auditEntry)
          node.depends.set(dependId, true);
        } catch {
          console.log(`[${new Date().toISOString()}] [${context.sessionId}] Node ${nodeId} is waiting for dependencies: ${[...node.depends.entries()].filter(([_, v]) => !v).map(([k, _]) => k).join(', ')}`);
          return;
        }
      }

      node.status = 'running';
      console.log(`[${new Date().toISOString()}] [${context.sessionId}] Node ${nodeId} started`);

      // Read retry configuration
      const retryConfig = (node.definition.config as any).retry ?? {};
      const maxAttempts = retryConfig.maxAttempts ?? DEFAULT_MAX_RETRY_ATTEMPTS;
      const backoff = retryConfig.backoff ?? DEFAULT_RETRY_BACKOFF;
      const baseDelay = retryConfig.delayMs ?? DEFAULT_RETRY_DELAY_MS;

      let lastError: Error | null = null;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          await this.executeNodeInternal(nodeId, node.definition, auditEntry, tempDir);
          node.status = 'success';
          console.log(`[${new Date().toISOString()}] [${context.sessionId}] Node ${nodeId} completed successfully`);
          state.logs.push(`✓ ${nodeId} completed`);
          if (!single) {
            await Promise.all(this.graph.getDirectDownstreamNodes(nodeId).map(downstreamId => this.executeNode(downstreamId, nodeId, context, state))).catch(() => { }); // Trigger downstream node execution
          }
          return // Return on success
        } catch (error) {
          // Do not retry skipped nodes; record skipped state and return
          if (error instanceof NodeSkippedError) {
            this.audit.skipped(auditEntry);
            // Leave a skipped marker in nodeOutputs so downstream nodes know the source was skipped
            this.context.nodeOutputs.set(nodeId, { __skipped: true });
            node.status = 'skipped';
            console.log(`[${new Date().toISOString()}] [${context.sessionId}] Node ${nodeId} skipped: ${error.message}`);
            state.logs.push(`⊘ ${nodeId} skipped`);
            return;
          }

          lastError = error instanceof Error ? error : new Error(String(error));

          if (attempt < maxAttempts) {
            // Calculate retry delay
            const delay = backoff === 'exponential'
              ? baseDelay * Math.pow(2, attempt - 1)
              : baseDelay;

            auditEntry.error = lastError.message;
            auditEntry.retry = { attempt, maxAttempts, delay };
            this.audit.update(auditEntry, 'retry');

            console.log(`[${new Date().toISOString()}] [${context.sessionId}] Node ${nodeId} failed on attempt ${attempt}: ${lastError.message}. Retrying in ${delay}ms...`);
            state.logs.push(`✗ ${nodeId} failed on attempt ${attempt}: ${lastError.message}. Retrying in ${delay}ms...`);
            // Wait, then retry
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        }
      }

      // All retries failed
      auditEntry.error = lastError?.message ?? 'Unknown error';
      this.audit.error(auditEntry);
      node.status = 'failed';
      console.log(`[${new Date().toISOString()}] [${context.sessionId}] Node ${nodeId} failed after ${maxAttempts} attempts: ${lastError?.message}`);
      state.logs.push(`✗ ${nodeId}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
      throw lastError;
    })
  }

  private async createTempDir(context: ExecutionContext, nodeId: string) {
    const tempDir = path.join(this.context.tempBaseDir, context.sessionId, `${nodeId}-${uuidv4()}`);
    await fs.mkdir(tempDir, { recursive: true });
    return tempDir;
  }

  /**
  * Execute the internal node logic without retry handling
   */
  private async executeNodeInternal(
    nodeId: string,
    node: NodeDefinition,
    auditEntry: any,
    tempDir: string
  ): Promise<void> {

    try {

      // 0. If an output file already exists, load it and return success directly (idempotent execution)
      const outputFilePath = this.getOutputFilePath(nodeId);
      try {
        await this.loadFromFile(outputFilePath, nodeId, auditEntry);
        return;
      } catch {
        // File does not exist, continue normal execution
      }

      // 1. Collect and validate inputs
      const inputs = this.collectInputs(node);
      this.validateInputs(node, inputs);

      // Inject start inputs for root nodes
      if (this.graph.getDirectUpstreamNodes(nodeId).length === 0) {
        Object.assign(inputs, this.startInputs);
      }

      auditEntry.inputs = inputs;
      this.audit.update(auditEntry, 'validate');

      // 2. Create node execution context
      const nodeContext: ExecutionContext = {
        ...this.context,
        tempBaseDir: tempDir
      };

      // 3. Execute node
      const executor = this.executors.get(node.type);
      if (!executor) {
        throw new Error(`No executor registered for node type: ${node.type}`);
      }

      const rawOutput = await executor.execute(node, inputs, nodeContext);

      // 4. Process output
      const output = await this.processOutput(node, rawOutput, tempDir);

      // 5. Validate output schema
      this.validateOutput(node, output);

      // 6. Persist output
      await this.persistOutput(outputFilePath, output);

      // 7. Record results
      this.context.nodeOutputs.set(nodeId, output);
      auditEntry.outputs = output;
      auditEntry.persistedFiles = {
        output: outputFilePath
      };
      this.audit.complete(auditEntry);

    } catch (error) {
      throw error;
    }
  }

  private async loadFromFile(outputFilePath: string, nodeId: string, auditEntry: any) {
    // Read cached output file if present
    const existingOutputContent = await fs.readFile(outputFilePath, 'utf-8');
    const existingOutput = JSON.parse(existingOutputContent);
    this.context.nodeOutputs.set(nodeId, existingOutput);
    auditEntry.outputs = existingOutput;
    auditEntry.persistedFiles = { output: outputFilePath };
    this.audit.complete(auditEntry);
    console.log(`[${new Date().toISOString()}] [${this.context.sessionId}] Node ${nodeId} output loaded from cache`);
  }

  /**
  * Collect node inputs, including conditional edges and dynamic routing
   */
  private collectInputs(node: NodeDefinition): Record<string, any> {
    const inputs: Record<string, any> = {};
    const edges = this.graph.getIncomingEdges(node.id);
    let hasActiveEdge = false;

    for (const edge of edges) {
      // Check edge condition
      if (edge.condition) {
        const conditionResult = this.evaluateEdgeCondition(edge, node.id);

        // Handle condition result
        if (conditionResult.action === 'stop') {
          // Stop the workflow
          this.workflowStopped = true;
          throw new Error(`Workflow stopped at edge ${edge.id}: condition not met`);
        }

        if (conditionResult.action === 'skip') {
          // Skip this edge
          continue;
        }

        if (conditionResult.action === 'skip-node') {
          // Skip the entire node
          throw new Error(`Node ${node.id}: skipped due to condition on edge ${edge.id}`);
        }

        if (conditionResult.action === 'error') {
          throw new Error(`Node ${node.id}: edge ${edge.id} condition not met`);
        }

        // Handle dynamic routing and check whether a branch matched
        if (conditionResult.action === 'route' && conditionResult.target) {
          // If the current node is not the routed target, skip this edge
          if (conditionResult.target.nodeId !== node.id) {
            continue;
          }
          // Use the input name specified by the routed target
          edge.input = conditionResult.target.input;
        }

        hasActiveEdge = true;
      } else {
        hasActiveEdge = true;
      }

      // Check source node output
      const sourceOutput = this.context.nodeOutputs.get(edge.from);
      if (sourceOutput === undefined) {
        // The source node was not executed, which should not happen in topological execution
        throw new Error(
          `Node ${node.id}: input '${edge.input}' depends on unexecuted node ${edge.from}`
        );
      }

      // If the source node was skipped, skip input propagation on this edge
      if (sourceOutput?.__skipped === true) {
        continue;
      }

      inputs[edge.input] = sourceOutput;
    }

    // If all incoming edges were skipped, or there are no active incoming edges, treat as empty input
    if (!hasActiveEdge || Object.keys(inputs).length === 0) {
      // Check whether incoming edges exist but were all skipped
      if (edges.length > 0) {
        // All incoming edges were skipped, so this node should be skipped as well
        throw new NodeSkippedError(node.id);
      }

      // No incoming edges: check whether the node has any outgoing edges and whether it is isolated
      // Isolated nodes without any connected edges should be skipped
      const incomingEdges = this.graph['graph'].inEdges(node.id);
      const outgoingEdges = this.graph['graph'].outEdges(node.id);

      if (incomingEdges.length === 0 && outgoingEdges.length === 0) {
        // Isolated node with no connected edges, skip it
        throw new NodeSkippedError(node.id);
      }
    }

    return inputs;
  }

  /**
   * Evaluate edge conditions based on branches configuration.
   * Returns: { action: 'continue' | 'skip' | 'skip-node' | 'stop' | 'error' | 'route', target?: { nodeId, input } }
   */
  private evaluateEdgeCondition(
    edge: {
      id: string; from: string; input: string; condition?: {
        branches: Array<{ expression: string; to: { nodeId: string; input: string } }>;
        onNoMatch?: 'skip' | 'skip-node' | 'stop' | 'error';
      }
    }, nodeId: string): {
      action: 'continue' | 'skip' | 'skip-node' | 'stop' | 'error' | 'route';
      target?: { nodeId: string; input: string }
    } {
    if (!edge.condition) {
      return { action: 'continue' };
    }

    const { branches, onNoMatch } = edge.condition;

    try {
      // Evaluate all branches and return the first matching result
      for (const branch of branches) {
        const branchFn = new Function('outputs', `return ${branch.expression}`);
        const result = branchFn(Object.fromEntries(this.context.nodeOutputs));
        if (!!result) {
          return { action: 'route', target: branch.to };
        }
      }

      // No branches matched; handle according to onNoMatch
      switch (onNoMatch) {
        case 'skip':
          return { action: 'skip' };
        case 'skip-node':
          return { action: 'skip-node' };
        case 'stop':
          return { action: 'stop' };
        case 'error':
          return { action: 'error' };
        default:
          // By default, continue to the target specified by edge.to
          return { action: 'continue' };
      }
    } catch (e) {
      throw new Error(`Node ${nodeId}: edge ${edge.id} condition evaluation failed: ${e}`);
    }
  }

  /**
   * Validate input schema.
   */
  private validateInputs(node: NodeDefinition, inputs: Record<string, any>): void {
    // If input is empty but incoming edges exist, all incoming edges were skipped, so skip this node
    if (Object.keys(inputs).length === 0) {
      const edges = this.graph.getIncomingEdges(node.id);
      if (edges.length > 0) {
        // Throw a dedicated error to mark the node as skipped
        throw new NodeSkippedError(node.id);
      }
      return;  // Nodes without incoming edges, such as root nodes, may have empty input
    }

    for (const [inputName, schema] of Object.entries(node.inputs)) {
      const validate = this.ajv.compile(schema);
      const value = inputs[inputName];

      if (value === undefined) {
        throw new Error(`Node ${node.id}: missing required input '${inputName}'`);
      }

      if (!validate(value)) {
        throw new Error(
          `Node ${node.id}: input '${inputName}' validation failed: ${this.ajv.errorsText(validate.errors)
          }`
        );
      }
    }
  }

  /**
   * Process output by applying outputMapping.
   */
  private async processOutput(
    node: NodeDefinition,
    rawOutput: any,
    tempDir: string
  ): Promise<any> {
    const config = node.config as any;
    const outputMapping = config.outputMapping;

    if (!outputMapping) {
      return rawOutput;
    }

    let output = rawOutput;

    // Extract a nested field
    if (outputMapping.extractField) {
      const fields = outputMapping.extractField.split('.');
      for (const field of fields) {
        output = output?.[field];
      }
      if (output === undefined) {
        throw new Error(
          `Node ${node.id}: outputMapping.extractField '${outputMapping.extractField}' not found`
        );
      }
    }

    // Apply transform script
    if (outputMapping.transformScript) {
      const transformScript = path.resolve(this.context.workflowDir, outputMapping.transformScript);
      const { execa } = await import('execa');
      const result = await execa('node', [transformScript], {
        input: JSON.stringify(output),
        cwd: tempDir
      });
      try {
        output = JSON.parse(result.stdout);
      } catch {
        throw new Error(`Node ${node.id}: output transform script did not return valid JSON: ${result.stdout}`);
      }
    }

    return output;
  }

  private getOutputFilePath(nodeId: string): string {
    return path.join(this.context.outputDir, this.context.sessionId, `${nodeId}.json`);
  }

  /**
   * Persist output.
   */
  private async persistOutput(filePath: string, output: any): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true }).catch(() => { }); // Ensure the directory exists
    return fs.writeFile(filePath, JSON.stringify(output, null, 2));
  }

  /**
   * Validate output schema.
   */
  private validateOutput(node: NodeDefinition, output: any): void {
    const validate = this.ajv.compile(node.output.schema);
    if (!validate(output)) {
      throw new Error(
        `Node ${node.id}: output validation failed: ${this.ajv.errorsText(validate.errors)}. Output: ${JSON.stringify(output).slice(0, 500)}`
      );
    }
  }
}
