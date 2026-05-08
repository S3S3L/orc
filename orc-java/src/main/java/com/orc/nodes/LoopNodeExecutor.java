package com.orc.nodes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.googlecode.aviator.AviatorEvaluator;
import com.orc.core.Executor;
import com.orc.core.NodeExecutor;
import com.orc.core.WorkflowGraph;
import com.orc.model.*;
import com.orc.model.ExecutionContext.NodeDebugContext;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

public class LoopNodeExecutor implements NodeExecutor {

    private static final Logger log = LoggerFactory.getLogger(LoopNodeExecutor.class);
    private static final String LAST_ITERATION_OUTPUT_KEY = "__lastIterationOutput";
    private static final ObjectMapper MAPPER = new ObjectMapper();

    @Override
    public Object execute(NodeDefinition node, Map<String, Object> inputs, ExecutionContext context) throws Exception {
        Map<String, Object> configMap = node.config();
        Map<String, Object> subGraphConfig = (Map<String, Object>) configMap.get("subGraph");
        int maxAttempts = ((Number) configMap.get("maxAttempts")).intValue();
        String validator = (String) configMap.get("validator");

        WorkflowDefinition workflowDef = context.workflowDef();

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> subNodesRaw = (List<Map<String, Object>>) subGraphConfig.get("nodes");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> subEdgesRaw = (List<Map<String, Object>>) subGraphConfig.get("edges");

        // Convert raw sub-graph nodes to NodeDefinition
        List<NodeDefinition> subNodes = new ArrayList<>();
        if (subNodesRaw != null) {
            for (Map<String, Object> raw : subNodesRaw) {
                String nodeId = (String) raw.get("id");
                String typeStr = (String) raw.get("type");
                NodeType type = NodeType.fromValue(typeStr);
                String name = (String) raw.getOrDefault("name", nodeId);
                String description = (String) raw.getOrDefault("description", "");
                @SuppressWarnings("unchecked")
                Map<String, Object> config = (Map<String, Object>) raw.getOrDefault("config", new HashMap<>());
                NodeDefinition subNode = new NodeDefinition(nodeId, type, name, description, null, Map.of(), config);
                subNodes.add(subNode);
            }
        }

        // Convert raw sub-graph edges to EdgeDefinition
        List<EdgeDefinition> subEdges = new ArrayList<>();
        if (subEdgesRaw != null) {
            for (Map<String, Object> raw : subEdgesRaw) {
                Map<String, Object> from = (Map<String, Object>) raw.get("from");
                Map<String, Object> to = (Map<String, Object>) raw.get("to");
                String edgeId = (String) raw.get("id");
                String fromNodeId = (String) from.get("nodeId");
                String toNodeId = (String) to.get("nodeId");
                String toInput = (String) to.get("input");
                EdgeDefinition.FromNode fromTarget = new EdgeDefinition.FromNode(fromNodeId);
                EdgeDefinition.ToNode toTarget = new EdgeDefinition.ToNode(toNodeId, toInput);
                EdgeDefinition edge = new EdgeDefinition(edgeId, fromTarget, toTarget, null);
                subEdges.add(edge);
            }
        }

        String baseOutputDir = context.outputDir() + "/" + node.id();
        String baseAuditDir = context.auditDir() + "/" + node.id();
        String baseTempDir = context.tempBaseDir() + "/" + node.id();

        Map<String, Object> lastOutputs = new HashMap<>();

        for (int attempt = 1; attempt <= maxAttempts; attempt++) {
            String attemptOutputDir = baseOutputDir + "-attempt-" + attempt;
            String attemptAuditDir = baseAuditDir + "-attempt-" + attempt;
            String attemptTempDir = baseTempDir + "-attempt-" + attempt;

            Map<String, Object> mergedInputs = new HashMap<>(inputs);
            mergedInputs.put(LAST_ITERATION_OUTPUT_KEY, lastOutputs);

            NodeDebugContext subDebug = new NodeDebugContext(null, false);
            Map<String, Object> subNodeOutputs = new HashMap<>();
            List<AuditEntry> subLogs = new ArrayList<>();
            ExecutionContext subContext = new ExecutionContext(
                    workflowDef, context.workflowDir(),
                    attemptOutputDir, attemptAuditDir, attemptTempDir,
                    context.sessionId(), subNodeOutputs, subLogs, subDebug, false);

            // Create sub-workflow with sub-graph nodes and edges
            WorkflowDefinition subWorkflow = new WorkflowDefinition(
                    workflowDef.version(), workflowDef.name() + "/sub:" + node.id(), workflowDef.description(),
                    workflowDef.schemaBaseDir(), workflowDef.schemas(),
                    subNodes, subEdges);

            try {
                WorkflowGraph subGraph = new WorkflowGraph(subWorkflow, context.workflowDir());
                Executor subExecutor = new Executor(subGraph, subContext, mergedInputs);
                ExecutionState subState = new ExecutionState("running", new ArrayList<>(), System.currentTimeMillis(), false, null);
                subExecutor.execute(subState);
            } catch (Exception e) {
                // Sub-graph execution failed — continue to validator check
            }

            lastOutputs = new HashMap<>(subNodeOutputs);

            // Evaluate validator expression
            Object isValid;
            try {
                log.debug("[Loop] Attempt {}: subNodeOutputs = {}, validator = '{}'", attempt, lastOutputs, validator);
                isValid = AviatorEvaluator.execute(validator, Map.of("outputs", lastOutputs));
                log.debug("[Loop] Attempt {}: isValid = {}", attempt, isValid);
            } catch (Exception e) {
                log.error("[Loop] Attempt {}: validator exception: {}", attempt, e.getMessage());
                isValid = false;
            }

            if (Boolean.TRUE.equals(isValid)) {
                return lastOutputs;
            }
        }

        throw new RuntimeException("LoopNode " + node.id() + " - All " + maxAttempts + " attempts failed validation");
    }
}
