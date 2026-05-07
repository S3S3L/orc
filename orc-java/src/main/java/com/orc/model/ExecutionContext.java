package com.orc.model;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

public record ExecutionContext(
        WorkflowDefinition workflowDef,
        String workflowDir,
        String outputDir,
        String auditDir,
        String tempBaseDir,
        String sessionId,
        Map<String, Object> nodeOutputs,
        List<AuditEntry> auditLog,
        NodeDebugContext debug,
        boolean cleanOldFiles
) {
    public ExecutionContext(
            WorkflowDefinition workflowDef,
            String workflowDir,
            String outputDir,
            String auditDir,
            String tempBaseDir,
            String sessionId,
            boolean cleanOldFiles
    ) {
        this(
                workflowDef, workflowDir, outputDir, auditDir, tempBaseDir, sessionId,
                new ConcurrentHashMap<>(), new ArrayList<>(),
                new NodeDebugContext(null, false), cleanOldFiles
        );
    }

    public record NodeDebugContext(String startNodeId, boolean single) {}
}
