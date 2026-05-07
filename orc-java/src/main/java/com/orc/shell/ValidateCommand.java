package com.orc.shell;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.core.WorkflowGraph;
import com.orc.model.WorkflowDefinition;
import com.orc.schema.SchemaValidator;
import org.springframework.shell.command.annotation.Command;
import org.springframework.shell.command.annotation.Option;
import org.springframework.stereotype.Component;

import java.io.File;
import java.util.List;

@Component
@Command(command = "orc")
public class ValidateCommand {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Command(command = "validate", description = "Validate a workflow definition")
    public String validate(
            @Option(longNames = {"workflow"}, description = "Workflow file path") String workflowPath
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
        System.out.println("  Execution order: " + String.join(" → ", order));

        return "Workflow is valid";
    }
}
