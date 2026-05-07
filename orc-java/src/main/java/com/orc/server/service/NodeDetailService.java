package com.orc.server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.core.Executor;
import com.orc.core.NodeInstance;
import com.orc.model.AuditEntry;
import com.orc.model.EdgeDefinition;
import com.orc.model.NodeDefinition;
import com.orc.model.NodeType;
import com.orc.model.WorkflowDefinition;
import com.orc.server.GlobalContext;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.*;

record NodeDetailResponse(
        NodeDefinition definition,
        String status,
        Map<String, Object> inputs,
        Object output,
        AuditEntry audit,
        List<Object> claudeMessages,
        String claudeHtmlUrl
) {}

@Service
public class NodeDetailService {

    private final GlobalContext globalContext;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public NodeDetailService(GlobalContext globalContext) {
        this.globalContext = globalContext;
    }

    public NodeDetailResponse getNodeDetail(String nodeId, String sessionId, WorkflowDefinition workflow) throws Exception {
        NodeDefinition nodeDef = workflow.nodes().stream()
                .filter(n -> n.id().equals(nodeId))
                .findFirst()
                .orElseThrow(() -> new NoSuchElementException("Node " + nodeId + " not found"));

        // Status: check running executor first, then default to pending
        String status = getNodeStatus(nodeId, sessionId);

        // Output: read from output file
        Object output = readJsonFileIfExists(globalContext.outputDir, sessionId, nodeId + ".json");

        // Inputs: collect from upstream edges
        Map<String, Object> inputs = collectInputs(nodeId, sessionId, workflow);

        // Audit: find latest audit file for this node + session
        AuditEntry audit = findLatestAuditEntry(nodeId, sessionId);

        // Claude messages + HTML URL
        List<Object> claudeMessages = null;
        String claudeHtmlUrl = null;
        if (nodeDef.type() == NodeType.claude_code && sessionId != null && !sessionId.isEmpty()) {
            claudeMessages = findClaudeMessages(nodeId, sessionId);
            String htmlPath = findClaudeHtml(nodeId, sessionId);
            if (htmlPath != null) {
                claudeHtmlUrl = "/api/v1/nodes/" + nodeId + "/claude-html?sessionId=" + sessionId;
            }
        }

        return new NodeDetailResponse(
                nodeDef, status,
                !inputs.isEmpty() ? inputs : null,
                output, audit, claudeMessages, claudeHtmlUrl);
    }

    private String getNodeStatus(String nodeId, String sessionId) {
        // Check if there's a running executor with this session
        Executor executor = globalContext.executions.get(sessionId);
        if (executor != null) {
            NodeInstance instance = executor.getNodes().get(nodeId);
            if (instance != null) {
                return instance.status.name();
            }
        }
        // Check if output file exists → success/completed
        if (readJsonFileIfExists(globalContext.outputDir, sessionId, nodeId + ".json") != null) {
            return "success";
        }
        return "pending";
    }

    private Map<String, Object> collectInputs(String nodeId, String sessionId, WorkflowDefinition workflow) {
        Map<String, Object> inputs = new HashMap<>();
        for (EdgeDefinition edge : workflow.edges()) {
            if (edge.to() != null && edge.to().nodeId().equals(nodeId)) {
                Object upstreamOutput = readJsonFileIfExists(globalContext.outputDir, sessionId, edge.from().nodeId() + ".json");
                if (upstreamOutput != null) {
                    inputs.put(edge.to().input(), upstreamOutput);
                }
            }
            if (edge.condition() != null && edge.condition().branches() != null) {
                for (EdgeDefinition.Condition.Branch branch : edge.condition().branches()) {
                    if (branch.to().nodeId().equals(nodeId)) {
                        Object upstreamOutput = readJsonFileIfExists(globalContext.outputDir, sessionId, edge.from().nodeId() + ".json");
                        if (upstreamOutput != null) {
                            inputs.put(branch.to().input(), upstreamOutput);
                        }
                    }
                }
            }
        }
        return inputs;
    }

    private AuditEntry findLatestAuditEntry(String nodeId, String sessionId) {
        if (globalContext.auditDir == null) return null;
        try {
            File auditDir = new File(globalContext.auditDir);
            if (!auditDir.isDirectory()) return null;

            File[] files = auditDir.listFiles((d, name) ->
                    name.startsWith(nodeId + "-") && name.endsWith(".json") && !name.contains("-messages"));
            if (files == null || files.length == 0) return null;

            // Prefer files containing sessionId, then sort by name
            List<File> sorted = Arrays.stream(files)
                    .filter(f -> sessionId == null || sessionId.isEmpty() || f.getName().contains(sessionId))
                    .sorted(Comparator.comparing(File::getName))
                    .toList();

            // If no session-matched files, try all files
            File latest = sorted.isEmpty()
                    ? Arrays.stream(files).max(Comparator.comparing(File::getName)).orElse(null)
                    : sorted.get(sorted.size() - 1);

            if (latest == null) return null;
            return objectMapper.readValue(latest, AuditEntry.class);
        } catch (Exception ignored) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    private List<Object> findClaudeMessages(String nodeId, String sessionId) {
        if (globalContext.auditDir == null) return null;
        try {
            File auditDir = new File(globalContext.auditDir);
            if (!auditDir.isDirectory()) return null;

            File[] files = auditDir.listFiles((d, name) ->
                    name.contains(sessionId) && name.contains(nodeId) && name.endsWith("-messages.json"));
            if (files == null || files.length == 0) return null;

            File latest = Arrays.stream(files)
                    .max(Comparator.comparing(File::getName))
                    .orElse(null);

            return latest != null
                    ? objectMapper.readValue(latest, List.class)
                    : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private String findClaudeHtml(String nodeId, String sessionId) {
        if (globalContext.outputDir == null) return null;
        try {
            File htmlDir = new File(globalContext.outputDir, sessionId);
            if (!htmlDir.isDirectory()) return null;

            File[] files = htmlDir.listFiles((d, name) ->
                    name.startsWith("claude_code_") && name.endsWith("_" + nodeId + ".html"));
            return (files != null && files.length > 0) ? files[0].getAbsolutePath() : null;
        } catch (Exception ignored) {
            return null;
        }
    }

    private Object readJsonFileIfExists(String baseDir, String sessionId, String fileName) {
        if (baseDir == null || sessionId == null) return null;
        try {
            File file = new File(baseDir, sessionId + "/" + fileName);
            return objectMapper.readValue(file, Object.class);
        } catch (Exception ignored) {
            return null;
        }
    }
}
