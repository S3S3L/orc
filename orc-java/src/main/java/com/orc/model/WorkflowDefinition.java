package com.orc.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;
import java.util.Map;

@JsonIgnoreProperties(ignoreUnknown = true)
public record WorkflowDefinition(
        String version,
        String name,
        String description,
        List<String> schemaBaseDir,
        Map<String, SchemaEntry> schemas,
        List<NodeDefinition> nodes,
        List<EdgeDefinition> edges
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record SchemaEntry(String file, JsonNode content) {}
}
