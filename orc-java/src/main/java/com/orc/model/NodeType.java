package com.orc.model;

public enum NodeType {
    bash,
    python,
    node,
    @com.fasterxml.jackson.annotation.JsonProperty("claude-code")
    claude_code,
    loop;

    @com.fasterxml.jackson.annotation.JsonValue
    public String toValue() {
        if (this == claude_code) return "claude-code";
        return name();
    }

    @com.fasterxml.jackson.annotation.JsonCreator
    public static NodeType fromValue(String value) {
        if ("claude-code".equals(value)) return claude_code;
        return valueOf(value);
    }
}
