package com.orc.runtime;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.model.AuditEntry;
import com.orc.model.Phase;

import java.io.File;
import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class AuditLogger {

    private final String auditDir;
    private final Map<String, AuditEntry> entries = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AuditLogger(String auditDir) {
        this.auditDir = auditDir;
        new File(auditDir).mkdirs();
    }

    public AuditEntry start(String nodeId, String tempDir) {
        AuditEntry entry = new AuditEntry(
                nodeId + "-" + System.currentTimeMillis(),
                java.time.Instant.now().toString(),
                nodeId,
                Phase.start,
                null, null,
                new AuditEntry.ExecutionDetail(tempDir, 0, -1, null, null),
                null, null, null);
        entries.put(entry.id(), entry);
        return entry;
    }

    public void update(AuditEntry entry, Phase phase) {
        AuditEntry updated = new AuditEntry(
                entry.id(), java.time.Instant.now().toString(), entry.nodeId(), phase,
                entry.inputs(), entry.outputs(), entry.execution(), entry.retry(), entry.persistedFiles(), entry.error());
        entries.put(entry.id(), updated);
    }

    public void complete(AuditEntry entry) {
        AuditEntry updated = new AuditEntry(
                entry.id(), java.time.Instant.now().toString(), entry.nodeId(), Phase.complete,
                entry.inputs(), entry.outputs(), entry.execution(), entry.retry(), entry.persistedFiles(), entry.error());
        entries.put(entry.id(), updated);
        persist(updated);
    }

    public void error(AuditEntry entry) {
        AuditEntry updated = new AuditEntry(
                entry.id(), java.time.Instant.now().toString(), entry.nodeId(), Phase.error,
                entry.inputs(), entry.outputs(), entry.execution(), entry.retry(), entry.persistedFiles(), entry.error());
        entries.put(entry.id(), updated);
        persist(updated);
    }

    public void skipped(AuditEntry entry) {
        AuditEntry updated = new AuditEntry(
                entry.id(), java.time.Instant.now().toString(), entry.nodeId(), Phase.skipped,
                entry.inputs(), entry.outputs(), entry.execution(), entry.retry(), entry.persistedFiles(), entry.error());
        entries.put(entry.id(), updated);
        persist(updated);
    }

    private void persist(AuditEntry entry) {
        try {
            File logFile = new File(auditDir, entry.id() + ".json");
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(logFile, entry);
        } catch (IOException e) {
            // Log silently, don't fail execution
        }
    }
}
