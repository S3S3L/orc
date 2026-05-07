package com.orc.server.controller;

import com.orc.server.GlobalContext;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class SessionController {

    private final GlobalContext globalContext;

    public SessionController(GlobalContext globalContext) {
        this.globalContext = globalContext;
    }

    @GetMapping("/sessions")
    public Object getSessions() {
        return globalContext.sessionHistory;
    }

    @PostMapping("/sessions")
    public Object startSession(
            @RequestParam(required = false) String sessionId,
            @RequestParam(required = false, defaultValue = "false") boolean cleanOldFiles) {

        if (globalContext.lastWorkflow == null) {
            return Map.of("error", "No workflow loaded");
        }

        String newSessionId = globalContext.startSession(
                globalContext.lastWorkflow,
                globalContext.workflowDir,
                globalContext.outputDir,
                globalContext.auditDir,
                globalContext.workspaceDir,
                cleanOldFiles,
                sessionId, null, false);

        return Map.of("sessionId", newSessionId);
    }

    @GetMapping("/sessions/{sessionId}/status")
    public Object getSessionStatus(@PathVariable String sessionId) {
        var activeState = globalContext.executionStates.get(sessionId);
        if (activeState != null) {
            return activeState;
        }

        var session = globalContext.sessionHistory.stream()
                .filter(s -> s.id().equals(sessionId))
                .findFirst();
        return session.<Object>map(s -> s).orElse(Map.of("error", "Session not found"));
    }
}
