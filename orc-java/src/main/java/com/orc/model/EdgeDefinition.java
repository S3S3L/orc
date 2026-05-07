package com.orc.model;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.databind.JsonNode;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record EdgeDefinition(
        String id,
        FromNode from,
        ToNode to,
        Condition condition
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FromNode(String nodeId) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ToNode(String nodeId, String input) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Condition(
            List<Branch> branches,
            String onNoMatch
    ) {
        @JsonIgnoreProperties(ignoreUnknown = true)
        public record Branch(String expression, ToNode to) {}
    }
}
