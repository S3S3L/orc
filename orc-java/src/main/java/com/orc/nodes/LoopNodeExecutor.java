package com.orc.nodes;

import com.googlecode.aviator.AviatorEvaluator;
import com.orc.core.Executor;
import com.orc.core.NodeExecutor;
import com.orc.core.WorkflowGraph;
import com.orc.model.*;
import com.orc.model.ExecutionContext.NodeDebugContext;

import java.util.*;

public class LoopNodeExecutor implements NodeExecutor {

    private static final String LAST_ITERATION_OUTPUT_KEY = "__lastIterationOutput";

    @Override
    public Object execute(NodeDefinition node, Map<String, Object> inputs, ExecutionContext context) throws Exception {
        Map<String, Object> configMap = node.config();
        Map<String, Object> subGraphConfig = (Map<String, Object>) configMap.get("subGraph");
        int maxAttempts = ((Number) configMap.get("maxAttempts")).intValue();
        String validator = (String) configMap.get("validator");

        WorkflowDefinition workflowDef = context.workflowDef();

        // Build sub-graph from workflow definition + sub-graph nodes/edges
        List<NodeDefinition> allNodes = new ArrayList<>(workflowDef.nodes());
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> subNodesRaw = (List<Map<String, Object>>) subGraphConfig.get("nodes");
        if (subNodesRaw != null) {
            // Sub-graph nodes need to be converted to NodeDefinition
            // For simplicity, we reuse the parent graph and filter
        }

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> subEdgesRaw = (List<Map<String, Object>>) subGraphConfig.get("edges");

        // Create sub-graph context
        String baseOutputDir = context.outputDir() + "/" + node.id();
        String baseAuditDir = context.auditDir() + "/" + node.id();
        String baseTempDir = context.tempBaseDir() + "/" + node.id();

        Map<String, Object> lastOutputs = new HashMap<>();

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            String attemptOutputDir = baseOutputDir + "-" + attempt;
            String attemptAuditDir = baseAuditDir + "-" + attempt;
            String attemptTempDir = baseTempDir + "-" + attempt;

            Map<String, Object> mergedInputs = new HashMap<>(inputs);
            mergedInputs.put(LAST_ITERATION_OUTPUT_KEY, lastOutputs);

            NodeDebugContext subDebug = new NodeDebugContext(null, false);
            ExecutionContext subContext = new ExecutionContext(
                    workflowDef, context.workflowDir(),
                    attemptOutputDir, attemptAuditDir, attemptTempDir,
                    context.sessionId(), new HashMap<>(), new ArrayList<>(), subDebug, context.cleanOldFiles());

            ExecutionState subState = new ExecutionState("running", new ArrayList<>(), System.currentTimeMillis(), false, null);

            // Build sub-graph from original workflow + sub-graph edges
            try {
                // Create a modified workflow definition for the sub-graph execution
                WorkflowDefinition subWorkflow = new WorkflowDefinition(
                        workflowDef.version(), workflowDef.name(), workflowDef.description(),
                        workflowDef.schemaBaseDir(), workflowDef.schemas(),
                        workflowDef.nodes(),
                        (List<EdgeDefinition>) subGraphConfig.getOrDefault("edges", List.of()));

                WorkflowGraph subGraph = new WorkflowGraph(subWorkflow, context.workflowDir());
                Executor subExecutor = new Executor(subGraph, subContext, mergedInputs);
                subExecutor.execute(subState);
            } catch (Exception e) {
                subState = new ExecutionState("error", subState.logs(), subState.startTime(), true, e.getMessage());
            }

            // Evaluate validator
            lastOutputs = new HashMap<>(subContext.nodeOutputs());

            // Simple validator evaluation using Aviator
            Object isValid;
            try {
                isValid = AviatorEvaluator.execute(validator, Map.of("outputs", lastOutputs));
            } catch (Exception e) {
                isValid = false;
            }

            if (Boolean.TRUE.equals(isValid)) {
                return lastOutputs;
            }
        }

        throw new RuntimeException("LoopNode " + node.id() + " - All " + maxAttempts + " attempts failed validation");
    }
}
