package com.orc.model;

import java.util.ArrayList;
import java.util.List;

public record ExecutionState(
        String status,
        List<String> logs,
        long startTime,
        boolean complete,
        String error
) {
    public ExecutionState(String status, List<String> logs, long startTime, boolean complete, String error) {
        this.status = status;
        this.logs = logs != null ? logs : new ArrayList<>();
        this.startTime = startTime;
        this.complete = complete;
        this.error = error;
    }

    public static ExecutionState running(String sessionId) {
        List<String> logs = new ArrayList<>();
        logs.add("Workflow started: " + sessionId);
        return new ExecutionState("running", logs, System.currentTimeMillis(), false, null);
    }
}
