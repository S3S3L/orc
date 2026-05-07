package com.orc.shell;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.core.Executor;
import com.orc.core.WorkflowGraph;
import com.orc.model.ExecutionContext;
import com.orc.model.ExecutionState;
import com.orc.model.WorkflowDefinition;
import com.orc.server.GlobalContext;
import org.springframework.shell.standard.ShellComponent;
import org.springframework.shell.standard.ShellMethod;
import org.springframework.shell.standard.ShellOption;

import java.io.File;
import java.util.UUID;

@ShellComponent
public class RunCommand {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final GlobalContext globalContext;

    public RunCommand(GlobalContext globalContext) {
        this.globalContext = globalContext;
    }

    @ShellMethod(key = "run", value = "Run a workflow")
    public String run(
            @ShellOption(value = {"--workflow"}, help = "Workflow file path") String workflowPath,
            @ShellOption(value = {"--output"}, defaultValue = "./output") String outputDir,
            @ShellOption(value = {"--sessionId"}, defaultValue = ShellOption.NULL) String sessionId,
            @ShellOption(value = {"--single"}, defaultValue = "false") boolean single,
            @ShellOption(value = {"--nodeId"}, defaultValue = ShellOption.NULL) String nodeId,
            @ShellOption(value = {"--workspace"}, defaultValue = "./workspace") String workspaceDir,
            @ShellOption(value = {"--audit"}, defaultValue = "./audit") String auditDir,
            @ShellOption(value = {"--cleanOldFiles"}, defaultValue = "false") boolean cleanOldFiles
    ) throws Exception {
        File workflowFile = new File(workflowPath);
        WorkflowDefinition workflow = objectMapper.readValue(workflowFile, WorkflowDefinition.class);

        String wfDir = workflowFile.getParentFile().getAbsolutePath();
        String sid = sessionId != null ? sessionId : UUID.randomUUID().toString();

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
