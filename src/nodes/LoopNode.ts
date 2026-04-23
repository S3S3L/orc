import { Executor, NodeExecutor } from "../core/Executor";
import { WorkflowGraph } from "../core/Graph";
import { NodeDefinition, ExecutionContext, LoopConfig, ExecutionState } from "../types";

const LAST_ITERATION_OUTPUT_KEY = '__lastIterationOutput';

export class LoopNode implements NodeExecutor {
    async execute(node: NodeDefinition, inputs: Record<string, any>, context: ExecutionContext): Promise<any> {
        const config = node.config as LoopConfig;
        const workflowDef = context.workflowDef;
        const graph = new WorkflowGraph({
            nodes: [
                ...workflowDef.nodes,
                ...(config.subGraph.nodes || [])
            ],
            edges: config.subGraph.edges || [],
            schemaBaseDir: [...workflowDef.schemaBaseDir || [], ...config.subGraph.schemaBaseDir || []],
            schemas: {
                ...workflowDef.schemas,
                ...(config.subGraph.schemas || {})
            }
        }, context.workflowDir);

        console.log(`Executing LoopNode ${node.id} with subgraph of ${graph.getAllValidNodes().length} nodes and maxAttempts=${config.maxAttempts}`);

        let lastOutputs: Record<string, any> = {};

        for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {

            console.log(`LoopNode ${node.id} - Attempt ${attempt}/${config.maxAttempts}`);

            const subContext: ExecutionContext = {
                ...context,
                outputDir: `${context.outputDir}/${node.id}-${attempt}`, // Separate output dir for each attempt
                auditDir: `${context.auditDir}/${node.id}-${attempt}`, // Separate audit dir for each attempt
                tempBaseDir: `${context.tempBaseDir}/${node.id}-${attempt}`, // Separate temp dir for each attempt
                nodeOutputs: new Map(), // Reset node outputs for each attempt
                debug: {} // Clear debug context so subgraph runs as normal full execution
            };

            const subExecutionState: ExecutionState = {
                status: 'running',
                logs: [],
                startTime: Date.now(),
                complete: false
            };

            const executor = new Executor(graph, subContext, {
                ...inputs,
                [LAST_ITERATION_OUTPUT_KEY]: lastOutputs // Pass last iteration outputs to subgraph
            });

            try {
                await executor.execute(subContext, subExecutionState)
            } catch (err) {
                console.error(`LoopNode ${node.id} - Attempt ${attempt}/${config.maxAttempts} execution error:`, err);
                subExecutionState.status = 'error';
                subExecutionState.error = err instanceof Error ? err.message : String(err);
            }

            const validator = new Function('outputs', `return ${config.validator}`); // Simple dynamic validator function

            lastOutputs = Object.fromEntries(subContext.nodeOutputs);

            const isValid = validator(lastOutputs);

            if (isValid) {
                subExecutionState.status = 'complete';
                console.log(`LoopNode ${node.id} - Attempt ${attempt}/${config.maxAttempts} complete and passed validation`);
                return lastOutputs;
            } else {
                console.warn(`LoopNode ${node.id} - Attempt ${attempt}/${config.maxAttempts} failed validation`);
            }
        }

        throw new Error(`LoopNode ${node.id} - All ${config.maxAttempts} attempts failed validation`);
    }
}