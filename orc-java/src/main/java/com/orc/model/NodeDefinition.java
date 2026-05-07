package com.orc.model;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonAnySetter;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.HashMap;
import java.util.Map;

public record NodeDefinition(
        String id,
        NodeType type,
        String name,
        String description,
        OutputSchema output,
        Map<String, JsonNode> inputs,
        Map<String, Object> config
) {
    public NodeDefinition {
        if (inputs == null) inputs = new HashMap<>();
        if (config == null) config = new HashMap<>();
    }

    @JsonAnySetter
    @JsonAnyGetter
    public void setProperty(String key, Object value) {
        // handled by record canonical constructor
    }

    public record OutputSchema(String ref, JsonNode schema) {}
}
