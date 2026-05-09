package com.orc.shell;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.model.WorkflowDefinition;
import com.orc.server.GlobalContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.shell.standard.ShellComponent;
import org.springframework.shell.standard.ShellMethod;
import org.springframework.shell.standard.ShellOption;

import java.io.File;
import java.util.Objects;

@ShellComponent
public class ServeCommand {

    private static final Logger log = LoggerFactory.getLogger(ServeCommand.class);

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

        if (workflowPath == null || workflowPath.isEmpty()) {
            workflowPath = autoDiscoverWorkflow();
        }

        if (workflowPath != null) {
            File workflowFile = new File(workflowPath);
            if (workflowFile.exists()) {
                WorkflowDefinition workflow = objectMapper.readValue(workflowFile, WorkflowDefinition.class);
                globalContext.lastWorkflow = workflow;
                globalContext.workflowDir = workflowFile.getParentFile().getAbsolutePath();
                log.info("Loaded workflow: {}", workflowFile.getAbsolutePath());
            } else {
                log.warn("Workflow file not found: {}", workflowPath);
            }
        }

        globalContext.setStorePath(globalContext.outputDir);

        System.out.println("ORC Web UI started at http://localhost:" + port);
        System.out.println("Loaded workflow: " + (globalContext.lastWorkflow != null ? workflowPath : "none (select from UI)"));
        System.out.println("Press Ctrl+C to stop");

        return "Server started on port " + port;
    }

    /**
     * Auto-discover workflow.json: check cwd first, then examples/ directory.
     */
    private String autoDiscoverWorkflow() {
        String cwd = System.getProperty("user.dir");

        // 1. Check cwd: workflow.json
        File cwdWorkflow = new File(cwd, "workflow.json");
        if (cwdWorkflow.exists()) {
            return cwdWorkflow.getAbsolutePath();
        }

        // 2. Check examples/ directory for any .json file
        File examplesDir = new File(cwd, "examples");
        if (examplesDir.isDirectory()) {
            File[] files = examplesDir.listFiles((dir, name) -> name.endsWith(".json"));
            if (files != null && files.length > 0) {
                return files[0].getAbsolutePath();
            }
        }

        // 3. Check parent directory's examples/ (common for orc-java/)
        File parentExamples = new File(cwd).getParentFile();
        if (parentExamples != null) {
            File examplesDir2 = new File(parentExamples, "examples");
            if (examplesDir2.isDirectory()) {
                File[] files = examplesDir2.listFiles((dir, name) -> name.endsWith(".json"));
                if (files != null && files.length > 0) {
                    return files[0].getAbsolutePath();
                }
            }
        }

        return null;
    }
}
