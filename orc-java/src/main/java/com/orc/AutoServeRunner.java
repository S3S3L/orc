package com.orc;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.model.WorkflowDefinition;
import com.orc.server.GlobalContext;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.io.File;
import java.util.Objects;

/**
 * Auto-load workflow and initialize GlobalContext on Spring Boot startup.
 * Runs regardless of whether Spring Shell executes a command.
 */
@Component
public class AutoServeRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AutoServeRunner.class);

    private final GlobalContext globalContext;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AutoServeRunner(GlobalContext globalContext) {
        this.globalContext = globalContext;
    }

    @Override
    public void run(ApplicationArguments args) throws Exception {
        String cwd = System.getProperty("user.dir");
        String outputDir = new File(cwd, "output").getAbsolutePath();
        String auditDir = new File(cwd, "audit").getAbsolutePath();
        String workspaceDir = new File(cwd, "workspace").getAbsolutePath();

        globalContext.outputDir = outputDir;
        globalContext.auditDir = auditDir;
        globalContext.workspaceDir = workspaceDir;

        // --workflow option overrides auto-discover
        String workflowPath = args.containsOption("workflow")
                ? args.getOptionValues("workflow").get(0)
                : autoDiscoverWorkflow(cwd);

        if (workflowPath != null) {
            File workflowFile = new File(workflowPath);
            if (workflowFile.exists()) {
                WorkflowDefinition workflow = objectMapper.readValue(workflowFile, WorkflowDefinition.class);
                globalContext.lastWorkflow = workflow;
                globalContext.workflowDir = workflowFile.getParentFile().getAbsolutePath();
                log.info("Auto-loaded workflow: {}", workflowFile.getAbsolutePath());
            } else {
                log.warn("Workflow file not found: {}", workflowPath);
            }
        }

        globalContext.setStorePath(outputDir);
    }

    private String autoDiscoverWorkflow(String cwd) {
        // 1. cwd/workflow.json
        File f = new File(cwd, "workflow.json");
        if (f.exists()) return f.getAbsolutePath();

        // 2. examples/*.json in cwd
        File examples = new File(cwd, "examples");
        if (examples.isDirectory()) {
            File[] files = examples.listFiles((dir, name) -> name.endsWith(".json"));
            if (files != null && files.length > 0) {
                return files[0].getAbsolutePath();
            }
        }

        // 3. parent/examples/*.json (e.g. orc-java/ -> ../examples/)
        File parent = new File(cwd).getParentFile();
        if (parent != null) {
            File parentExamples = new File(parent, "examples");
            if (parentExamples.isDirectory()) {
                File[] files = parentExamples.listFiles((dir, name) -> name.endsWith(".json"));
                if (files != null && files.length > 0) {
                    return files[0].getAbsolutePath();
                }
            }
        }

        return null;
    }
}
