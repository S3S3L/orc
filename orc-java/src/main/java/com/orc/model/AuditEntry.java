package com.orc.model;

import java.util.Map;

public record AuditEntry(
        String id,
        String timestamp,
        String nodeId,
        Phase phase,
        Map<String, Object> inputs,
        Object outputs,
        ExecutionDetail execution,
        RetryInfo retry,
        PersistedFiles persistedFiles,
        String error
) {
    public record ExecutionDetail(String tempDir, long duration, int exitCode, String stdout, String stderr) {}
    public record RetryInfo(int attempt, int maxAttempts, long delay) {}
    public record PersistedFiles(String output, String[] logs) {}
}
