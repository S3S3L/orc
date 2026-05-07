package com.orc.shell;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.model.WorkflowDefinition;
import com.orc.server.GlobalContext;
import org.springframework.shell.command.annotation.Command;
import org.springframework.shell.command.annotation.Option;
import org.springframework.stereotype.Component;

import java.io.File;

@Component
@Command(command = "orc")
public class ServeCommand {

    private final GlobalContext globalContext;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public ServeCommand(GlobalContext globalContext) {
        this.globalContext = globalContext;
    }

    @Command(command = "serve", description = "Start web UI server")
    public String serve(
            @Option(longNames = {"workflow"}, description = "Workflow file path", defaultValue = "") String workflowPath,
            @Option(longNames = {"port"}, description = "Port number", defaultValue = "3000") int port,
            @Option(longNames = {"output"}, description = "Output directory", defaultValue = "./output") String outputDir,
            @Option(longNames = {"workspace"}, description = "Workspace directory", defaultValue = "./workspace") String workspaceDir,
            @Option(longNames = {"audit"}, description = "Audit log directory", defaultValue = "./audit") String auditDir
    ) throws Exception {
        globalContext.outputDir = new File(outputDir).getAbsolutePath();
        globalContext.auditDir = new File(auditDir).getAbsolutePath();
        globalContext.workspaceDir = new File(workspaceDir).getAbsolutePath();

        if (!workflowPath.isEmpty()) {
            File workflowFile = new File(workflowPath);
            WorkflowDefinition workflow = objectMapper.readValue(workflowFile, WorkflowDefinition.class);
            globalContext.lastWorkflow = workflow;
            globalContext.workflowDir = workflowFile.getParentFile().getAbsolutePath();
        }

        globalContext.setStorePath(globalContext.outputDir);

        System.out.println("ORC Web UI started at http://localhost:" + port);
        System.out.println("Loaded workflow: " + (workflowPath.isEmpty() ? "none" : workflowPath));
        System.out.println("Press Ctrl+C to stop");

        // Spring Boot web server is already running via @SpringBootApplication
        return "Server started on port " + port;
    }
}
