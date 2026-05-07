package com.orc.shell;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.core.WorkflowGraph;
import com.orc.model.WorkflowDefinition;
import com.orc.schema.SchemaValidator;
import org.springframework.shell.standard.ShellComponent;
import org.springframework.shell.standard.ShellMethod;
import org.springframework.shell.standard.ShellOption;

import java.io.File;
import java.util.List;

@ShellComponent
public class ValidateCommand {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @ShellMethod(key = "validate", value = "Validate a workflow definition")
    public String validate(
            @ShellOption(value = {"--workflow"}, help = "Workflow file path") String workflowPath
    ) throws Exception {
        File workflowFile = new File(workflowPath);
        WorkflowDefinition workflow = objectMapper.readValue(workflowFile, WorkflowDefinition.class);

        SchemaValidator validator = new SchemaValidator();
        validator.validate(objectMapper.readTree(workflowFile));

        String wfDir = workflowFile.getParentFile().getAbsolutePath();
        WorkflowGraph graph = new WorkflowGraph(workflow, wfDir);

        System.out.println("Workflow is valid");
        System.out.println("  Nodes: " + graph.size());
        List<String> order = graph.getExecutionOrder();
        System.out.println("  Execution order: " + String.join(" -> ", order));

        return "Workflow is valid";
    }
}
