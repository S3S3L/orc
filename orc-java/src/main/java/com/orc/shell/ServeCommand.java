package com.orc.shell;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.model.WorkflowDefinition;
import com.orc.server.GlobalContext;
import org.springframework.shell.standard.ShellComponent;
import org.springframework.shell.standard.ShellMethod;
import org.springframework.shell.standard.ShellOption;

import java.io.File;

@ShellComponent
public class ServeCommand {

    private final GlobalContext globalContext;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ServeCommand(GlobalContext globalContext) {
        this.globalContext = globalContext;
    }

    @ShellMethod(key = "serve", value = "Start web UI server")
    public String serve(
            @ShellOption(value = {"--workflow"}, defaultValue = ShellOption.NULL) String workflowPath,
            @ShellOption(value = {"--port"}, defaultValue = "3000") int port,
            @ShellOption(value = {"--output"}, defaultValue = "./output") String outputDir,
            @ShellOption(value = {"--workspace"}, defaultValue = "./workspace") String workspaceDir,
            @ShellOption(value = {"--audit"}, defaultValue = "./audit") String auditDir
    ) throws Exception {
        globalContext.outputDir = new File(outputDir).getAbsolutePath();
        globalContext.auditDir = new File(auditDir).getAbsolutePath();
        globalContext.workspaceDir = new File(workspaceDir).getAbsolutePath();

        if (workflowPath != null && !workflowPath.isEmpty()) {
            File workflowFile = new File(workflowPath);
            WorkflowDefinition workflow = objectMapper.readValue(workflowFile, WorkflowDefinition.class);
            globalContext.lastWorkflow = workflow;
            globalContext.workflowDir = workflowFile.getParentFile().getAbsolutePath();
        }

        globalContext.setStorePath(globalContext.outputDir);

        System.out.println("ORC Web UI started at http://localhost:" + port);
        System.out.println("Loaded workflow: " + (workflowPath == null ? "none" : workflowPath));
        System.out.println("Press Ctrl+C to stop");

        return "Server started on port " + port;
    }
}
