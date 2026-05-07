package com.orc.model.config;

import com.orc.model.EdgeDefinition;
import com.orc.model.NodeDefinition;
import com.orc.model.WorkflowDefinition;

import java.util.List;

public record LoopConfig(
        Long timeout,
        BaseNodeConfig.RetryConfig retry,
        SubGraph subGraph,
        int maxAttempts,
        String validator
) {
    public record SubGraph(
            List<NodeDefinition> nodes,
            List<EdgeDefinition> edges,
            List<String> schemaBaseDir,
            java.util.Map<String, WorkflowDefinition.SchemaEntry> schemas
    ) {}
}
