package com.orc.server;

import com.orc.model.ExecutionState;
import com.orc.model.SessionSummary;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.core.Executor;
import org.springframework.stereotype.Component;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class GlobalContext {
    public Object lastWorkflow = null;
    public final Map<String, ExecutionState> executionStates = new ConcurrentHashMap<>();
    public final Map<String, Executor> executions = new ConcurrentHashMap<>();
    public String outputDir;
    public String auditDir;
    public String workspaceDir;
    public String workflowDir;
    public final List<SessionSummary> sessionHistory = new ArrayList<>();

    private String storePath;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ObjectMapper objectMapper() {
        return objectMapper;
    }

    public void setStorePath(String baseDir) {
        this.storePath = new File(baseDir, ".sessions.json").getAbsolutePath();
        loadSessions();
    }

    public void loadSessions() {
        if (storePath == null) return;
        try {
            File file = new File(storePath);
            if (file.exists()) {
                SessionSummary[] sessions = objectMapper.readValue(file, SessionSummary[].class);
                sessionHistory.clear();
                for (SessionSummary s : sessions) {
                    if (!"running".equals(s.status())) {
                        sessionHistory.add(s);
                    }
                }
            }
        } catch (Exception ignored) {
            sessionHistory.clear();
        }
    }

    public void saveSessions() {
        if (storePath == null) return;
        try {
            File file = new File(storePath);
            file.getParentFile().mkdirs();
            objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, sessionHistory);
        } catch (Exception ignored) {
        }
    }

    public String startSession(Object workflow, String workflowDir, String outputDir,
                                String auditDir, String workspaceDir, boolean cleanOldFiles,
                                String requestedSessionId, String startNodeId, boolean single) {
        this.lastWorkflow = workflow;
        this.workflowDir = workflowDir;
        this.outputDir = outputDir;
        this.auditDir = auditDir;
        this.workspaceDir = workspaceDir;
        if (this.storePath == null) setStorePath(outputDir);

        String sessionId = requestedSessionId != null ? requestedSessionId : UUID.randomUUID().toString();
        boolean isReusedSession = requestedSessionId != null && executionStates.containsKey(requestedSessionId);

        ExecutionState state = executionStates.get(sessionId);
        if (state == null) {
            state = ExecutionState.running(sessionId);
            executionStates.put(sessionId, state);
        } else if (!isReusedSession) {
            state = new ExecutionState("running", new ArrayList<>(List.of("Workflow resumed: " + sessionId)),
                    System.currentTimeMillis(), false, null);
            executionStates.put(sessionId, state);
        }

        if (!isReusedSession) {
            Map<String, Object> wf = (Map<String, Object>) workflow;
            SessionSummary summary = new SessionSummary(
                    sessionId, (String) wf.get("name"), "running", state.startTime(),
                    null, ((List<?>) wf.get("nodes")).size(), null);
            sessionHistory.add(0, summary);
        }

        return sessionId;
    }
}
