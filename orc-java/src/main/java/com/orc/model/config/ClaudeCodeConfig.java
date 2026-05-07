package com.orc.model.config;

import java.util.Map;

public record ClaudeCodeConfig(
        Long timeout,
        BaseNodeConfig.RetryConfig retry,
        PromptConfig prompt,
        Map<String, InputMapping> inputMapping,
        ExecutionConfig execution,
        ResumeConfig resume,
        CapabilitiesConfig capabilities
) {
    public record PromptConfig(String markdown, boolean template) {}
    public record InputMapping(String target, String section, String filePath) {}
    public record ExecutionConfig(AuditConfig audit) {
        public record AuditConfig(boolean enabled, boolean logStdout, boolean logStderr, boolean saveMessages) {}
    }
    public record ResumeConfig(int maxAttempts, String prompt, String validator) {}
    public record CapabilitiesConfig(ToolsConfig tools, boolean enableSkills, McpConfig mcp) {
        public record ToolsConfig(String[] allowed, String[] denied) {}
        public record McpConfig(boolean enabled, String[] enabledServices, String config) {}
    }
}
