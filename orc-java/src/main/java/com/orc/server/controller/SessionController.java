package com.orc.server.controller;

import com.orc.model.ExecutionState;
import com.orc.model.SessionSummary;
import com.orc.model.WorkflowDefinition;
import com.orc.server.GlobalContext;
import com.orc.server.service.ExecutionService;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

@RestController
@RequestMapping("/api/v1")
public class SessionController {

    private final GlobalContext globalContext;
    private final ExecutionService executionService;

    public SessionController(GlobalContext globalContext, ExecutionService executionService) {
        this.globalContext = globalContext;
        this.executionService = executionService;
    }

    // GET /api/v1/sessions
    @GetMapping("/sessions")
    public Object getSessions() {
        List<SessionSummary> result = new ArrayList<>();
        // Merge live execution states with persisted session history
        for (var entry : globalContext.executionStates.entrySet()) {
            String sid = entry.getKey();
            ExecutionState state = entry.getValue();
            SessionSummary hist = globalContext.sessionHistory.stream()
                    .filter(s -> s.id().equals(sid))
                    .findFirst().orElse(null);
            if (hist != null) {
                result.add(new SessionSummary(
                        sid, hist.workflowName(), state.status(),
                        state.startTime(), state.complete() ? state.startTime() : null,
                        hist.nodeCount(), null));
            } else {
                result.add(new SessionSummary(
                        sid, "Unknown", state.status(),
                        state.startTime(), state.complete() ? state.startTime() : null,
                        0, null));
            }
        }
        // Add persisted sessions that are not actively running
        for (SessionSummary s : globalContext.sessionHistory) {
            if (!globalContext.executionStates.containsKey(s.id())) {
                result.add(s);
            }
        }
        return result;
    }

    // POST /api/v1/sessions - Start a new workflow run
    @PostMapping("/sessions")
    public Object startSession(
            @RequestParam(required = false) String sessionId,
            @RequestParam(required = false, defaultValue = "false") boolean cleanOldFiles) {

        if (globalContext.lastWorkflow == null) {
            return Map.of("error", "No workflow loaded");
        }

        WorkflowDefinition wf = globalContext.objectMapper().convertValue(globalContext.lastWorkflow, WorkflowDefinition.class);
        String newSessionId = executionService.startWorkflow(wf, cleanOldFiles, sessionId, null, false);

        return Map.of("sessionId", newSessionId);
    }

    // POST /api/v1/sessions/:sessionId/rerun
    @PostMapping("/sessions/{sessionId}/rerun")
    public Object rerunSession(@PathVariable String sessionId) throws Exception {
        if (globalContext.lastWorkflow == null) {
            return Map.of("error", "No workflow loaded");
        }

        // Delete old output directory
        if (globalContext.outputDir != null) {
            File oldDir = new File(globalContext.outputDir, sessionId);
            if (oldDir.exists()) {
                deleteRecursively(oldDir);
            }
        }

        WorkflowDefinition wf = globalContext.objectMapper().convertValue(globalContext.lastWorkflow, WorkflowDefinition.class);
        String newSessionId = executionService.startWorkflow(wf, true, null, null, false);

        return Map.of("sessionId", newSessionId);
    }

    // GET /api/v1/sessions/:sessionId/status
    @GetMapping("/sessions/{sessionId}/status")
    public Object getSessionStatus(@PathVariable String sessionId) {
        var activeState = globalContext.executionStates.get(sessionId);
        if (activeState != null) {
            var executor = globalContext.executions.get(sessionId);
            if (executor != null) {
                List<Map<String, Object>> nodes = executor.getNodes().values().stream()
                        .map(n -> Map.<String, Object>of(
                                "definition", n.definition,
                                "status", n.status.name()))
                        .toList();
                return Map.of(
                        "status", activeState.status(),
                        "logs", activeState.logs(),
                        "startTime", activeState.startTime(),
                        "complete", activeState.complete(),
                        "nodes", nodes);
            }
            return activeState;
        }

        var session = globalContext.sessionHistory.stream()
                .filter(s -> s.id().equals(sessionId))
                .findFirst();
        return session.map(s -> (Object) Map.of(
                "status", s.status(),
                "nodeStatuses", s.nodeStatuses(),
                "startTime", s.startTime(),
                "endTime", s.endTime()))
                .orElse(Map.of("error", "Session not found"));
    }

    private void deleteRecursively(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        file.delete();
    }
}
