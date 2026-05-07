package com.orc.server.controller;

import com.orc.model.NodeDefinition;
import com.orc.model.NodeType;
import com.orc.model.WorkflowDefinition;
import com.orc.server.GlobalContext;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/loops")
public class LoopController {

    private final GlobalContext globalContext;

    public LoopController(GlobalContext globalContext) {
        this.globalContext = globalContext;
    }

    // GET /api/v1/loops/:nodeId/subgraph
    @GetMapping("/{nodeId}/subgraph")
    public Object getLoopSubgraph(@PathVariable String nodeId) {
        Object workflow = globalContext.lastWorkflow;
        if (workflow == null) {
            return Map.of("error", "No workflow loaded");
        }

        WorkflowDefinition wf = globalContext.objectMapper().convertValue(workflow, WorkflowDefinition.class);
        NodeDefinition loopNode = wf.nodes().stream()
                .filter(n -> n.id().equals(nodeId))
                .findFirst()
                .orElse(null);

        if (loopNode == null) {
            return Map.of("error", "Node " + nodeId + " not found");
        }
        if (loopNode.type() != NodeType.loop) {
            return Map.of("error", "Node " + nodeId + " is not a loop node");
        }

        Map<String, Object> loopConfig = loopNode.config();
        @SuppressWarnings("unchecked")
        Map<String, Object> subGraph = (Map<String, Object>) loopConfig.get("subGraph");
        if (subGraph == null) {
            return Map.of("error", "Node " + nodeId + " has no subGraph");
        }

        return Map.of(
                "nodeId", nodeId,
                "subGraph", Map.of(
                        "nodes", subGraph.getOrDefault("nodes", java.util.List.of()),
                        "edges", subGraph.getOrDefault("edges", java.util.List.of()),
                        "schemas", subGraph.getOrDefault("schemas", Map.of())
                ),
                "maxAttempts", loopConfig.getOrDefault("maxAttempts", 3),
                "validator", loopConfig.getOrDefault("validator", "")
        );
    }
}
