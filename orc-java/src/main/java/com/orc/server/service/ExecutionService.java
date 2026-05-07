package com.orc.server.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.core.Executor;
import com.orc.core.WorkflowGraph;
import com.orc.model.*;
import com.orc.server.GlobalContext;
import org.springframework.stereotype.Service;

import java.io.File;
import java.util.ArrayList;
import java.util.Map;
import java.util.UUID;

@Service
public class ExecutionService {

    private final GlobalContext globalContext;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ExecutionService(GlobalContext globalContext) {
        this.globalContext = globalContext;
    }

    /**
     * Start a full workflow execution or resume from a specific node.
     * Mirrors TS startWorkflowExecution().
     */
    public String startWorkflow(
            WorkflowDefinition workflow,
            boolean cleanOldFiles,
            String sessionId,
            String startNodeId,
            boolean single
    ) {
        String newSessionId = globalContext.startSession(
                workflowToMap(workflow),
                globalContext.workflowDir,
                globalContext.outputDir,
                globalContext.auditDir,
                globalContext.workspaceDir,
                cleanOldFiles,
                sessionId, startNodeId, single);

        // Build graph and executor, then run asynchronously
        WorkflowGraph graph = new WorkflowGraph(workflow, globalContext.workflowDir);
        ExecutionContext ctx = buildExecutionContext(workflow, newSessionId, cleanOldFiles, startNodeId, single);
        ExecutionState state = globalContext.executionStates.get(newSessionId);

        Executor executor = new Executor(graph, ctx);
        globalContext.executions.put(newSessionId, executor);

        // Run in background thread
        Thread.startVirtualThread(() -> {
            try {
                executor.execute(state);
                globalContext.executionStates.put(newSessionId,
                        new ExecutionState("complete", state.logs(), state.startTime(), true, null));
                globalContext.saveSessions();
            } catch (Exception e) {
                globalContext.executionStates.put(newSessionId,
                        new ExecutionState("error", state.logs(), state.startTime(), true, e.getMessage()));
                globalContext.saveSessions();
            }
        });

        return newSessionId;
    }

    /**
     * Run a single node (used by POST /nodes/:id/run with single=true).
     * Deletes existing output file if sessionId is provided.
     */
    public void deleteNodeOutput(String nodeId, String sessionId) {
        if (sessionId != null && globalContext.outputDir != null) {
            File outputFile = new File(globalContext.outputDir, sessionId + "/" + nodeId + ".json");
            if (outputFile.exists()) {
                outputFile.delete();
            }
        }
    }

    private ExecutionContext buildExecutionContext(
            WorkflowDefinition workflow, String sessionId,
            boolean cleanOldFiles, String startNodeId, boolean single
    ) {
        ExecutionContext.NodeDebugContext debug = new ExecutionContext.NodeDebugContext(
                startNodeId, single);
        return new ExecutionContext(
                workflow, globalContext.workflowDir, globalContext.outputDir,
                globalContext.auditDir, globalContext.workspaceDir,
                sessionId, new java.util.concurrent.ConcurrentHashMap<>(),
                new ArrayList<>(), debug, cleanOldFiles);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> workflowToMap(WorkflowDefinition workflow) {
        return objectMapper.convertValue(workflow, Map.class);
    }
}
