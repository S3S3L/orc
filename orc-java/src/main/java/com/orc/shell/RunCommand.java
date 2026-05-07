package com.orc.shell;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.core.Executor;
import com.orc.core.WorkflowGraph;
import com.orc.model.ExecutionContext;
import com.orc.model.ExecutionState;
import com.orc.model.WorkflowDefinition;
import com.orc.server.GlobalContext;
import org.jline.utils.InfoCmp.Capability;
import org.springframework.shell.command.annotation.Command;
import org.springframework.shell.command.annotation.Option;
import org.springframework.stereotype.Component;

import java.io.File;
import java.nio.file.Files;
import java.util.UUID;

@Component
@Command(command = "orc")
public class RunCommand {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final GlobalContext globalContext;

    public RunCommand(GlobalContext globalContext) {
        this.globalContext = globalContext;
    }

    @Command(command = "run", description = "Run a workflow")
    public String run(
            @Option(longNames = {"workflow"}, description = "Workflow file path") String workflowPath,
            @Option(longNames = {"output"}, description = "Output directory", defaultValue = "./output") String outputDir,
            @Option(longNames = {"sessionId"}, description = "Session ID", defaultValue = "") String sessionId,
            @Option(longNames = {"single"}, description = "Single node execution", defaultValue = "false") boolean single,
            @Option(longNames = {"nodeId"}, description = "Node ID for startFrom", defaultValue = "") String nodeId,
            @Option(longNames = {"workspace"}, description = "Workspace directory", defaultValue = "./workspace") String workspaceDir,
            @Option(longNames = {"audit"}, description = "Audit log directory", defaultValue = "./audit") String auditDir,
            @Option(longNames = {"cleanOldFiles"}, description = "Clean old files", defaultValue = "false") boolean cleanOldFiles
    ) throws Exception {
        File workflowFile = new File(workflowPath);
        WorkflowDefinition workflow = objectMapper.readValue(workflowFile, WorkflowDefinition.class);

        String wfDir = workflowFile.getParentFile().getAbsolutePath();
        String sid = sessionId.isEmpty() ? UUID.randomUUID().toString() : sessionId;

        File output = new File(outputDir);
        output.mkdirs();
        new File(auditDir).mkdirs();
        new File(workspaceDir).mkdirs();

        ExecutionContext context = new ExecutionContext(
                workflow, wfDir, output.getAbsolutePath(), auditDir, workspaceDir,
                sid, cleanOldFiles);

        WorkflowGraph graph = new WorkflowGraph(workflow, wfDir);
        Executor executor = new Executor(graph, context);

        ExecutionState state = ExecutionState.running(sid);
        globalContext.executionStates.put(sid, state);
        globalContext.executions.put(sid, executor);

        System.out.println("[" + java.time.Instant.now() + "] [" + sid + "] Workflow execution started");
        System.out.println("[" + java.time.Instant.now() + "] [" + sid + "] Workflow: " + workflow.name());
        System.out.println("[" + java.time.Instant.now() + "] [" + sid + "] Nodes: " + workflow.nodes().size());

        try {
            executor.execute(state);
            System.out.println("[" + java.time.Instant.now() + "] [" + sid + "] Workflow completed successfully");
            return "Workflow completed successfully";
        } catch (Exception e) {
            System.err.println("[" + java.time.Instant.now() + "] [" + sid + "] Workflow failed: " + e.getMessage());
            throw e;
        }
    }
}
