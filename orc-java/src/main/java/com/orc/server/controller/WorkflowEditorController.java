package com.orc.server.controller;

import com.orc.model.WorkflowDefinition;
import com.orc.server.GlobalContext;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/editor")
public class WorkflowEditorController {

    private final GlobalContext globalContext;

    public WorkflowEditorController(GlobalContext globalContext) {
        this.globalContext = globalContext;
    }

    /**
     * List all workflows from workspace/ and examples/ directories.
     */
    @GetMapping("/workflows")
    public List<Map<String, Object>> listWorkflows() {
        List<Map<String, Object>> result = new ArrayList<>();

        // Scan workspace/ directories
        if (globalContext.workspaceDir != null) {
            File workspaceDir = new File(globalContext.workspaceDir);
            if (workspaceDir.isDirectory()) {
                File[] dirs = workspaceDir.listFiles(File::isDirectory);
                if (dirs != null) {
                    for (File dir : dirs) {
                        File wfFile = new File(dir, "workflow.json");
                        if (wfFile.exists()) {
                            result.add(Map.of(
                                    "id", dir.getName(),
                                    "name", "workflow.json",
                                    "path", wfFile.getAbsolutePath(),
                                    "readOnly", false
                            ));
                        }
                    }
                }
            }
        }

        // Scan examples/ as read-only presets
        File examplesDir = findExamplesDirectory();
        if (examplesDir.exists() && examplesDir.isDirectory()) {
            File[] files = examplesDir.listFiles((d, n) -> n.endsWith(".json"));
            if (files != null) {
                for (File f : files) {
                    result.add(Map.of(
                            "id", "example:" + f.getName(),
                            "name", f.getName(),
                            "path", f.getAbsolutePath(),
                            "readOnly", true
                    ));
                }
            }
        }

        return result;
    }

    /**
     * Create a new workflow with default template.
     */
    @PostMapping("/workflows")
    public Map<String, String> createWorkflow(@RequestBody(required = false) Map<String, String> body) throws Exception {
        String id = UUID.randomUUID().toString();
        File dir = new File(globalContext.workspaceDir, id);
        dir.mkdirs();

        String name = body != null && body.containsKey("name") ? body.get("name") : "New Workflow";

        WorkflowDefinition wf = new WorkflowDefinition(
                "1.0", name, "", List.of(), Map.of(), List.of(), List.of()
        );

        File wfFile = new File(dir, "workflow.json");
        globalContext.objectMapper().writerWithDefaultPrettyPrinter().writeValue(wfFile, wf);
        return Map.of("id", id);
    }

    /**
     * Copy an example workflow to workspace.
     */
    @PostMapping("/workflows/{exampleId}/copy")
    public Map<String, String> copyExample(@PathVariable String exampleId) throws Exception {
        if (!exampleId.startsWith("example:")) {
            return Map.of("error", "Not an example workflow");
        }
        String fileName = exampleId.substring("example:".length());
        File exampleFile = findExamplesDirectory();
        if (exampleFile == null || !exampleFile.exists()) {
            return Map.of("error", "Examples directory not found");
        }
        File resolved = new File(exampleFile, fileName);
        if (!resolved.exists()) {
            return Map.of("error", "Example not found");
        }

        String id = UUID.randomUUID().toString();
        File dir = new File(globalContext.workspaceDir, id);
        dir.mkdirs();

        Object wf = globalContext.objectMapper().readValue(exampleFile, Object.class);
        File wfFile = new File(dir, "workflow.json");
        globalContext.objectMapper().writerWithDefaultPrettyPrinter().writeValue(wfFile, wf);
        return Map.of("id", id);
    }

    /**
     * Load a workflow JSON by ID.
     */
    @GetMapping("/workflow/{id}")
    public Object getWorkflow(@PathVariable String id) {
        try {
            File wfFile;
            if (id.startsWith("example:")) {
                String fileName = id.substring("example:".length());
                String cwd = System.getProperty("user.dir");
                wfFile = new File(cwd, "examples/" + fileName);
            } else {
                wfFile = new File(globalContext.workspaceDir, id + "/workflow.json");
            }

            if (!wfFile.exists()) {
                return Map.of("error", "Workflow not found: " + id);
            }

            return globalContext.objectMapper().readValue(wfFile, Object.class);
        } catch (Exception e) {
            return Map.of("error", "Failed to load workflow: " + e.getMessage());
        }
    }

    /**
     * Save a workflow JSON.
     */
    @PutMapping("/workflow/{id}")
    public Map<String, String> saveWorkflow(@PathVariable String id, @RequestBody Object body) {
        try {
            File wfFile = new File(globalContext.workspaceDir, id + "/workflow.json");
            if (!wfFile.exists()) {
                return Map.of("error", "Workflow not found: " + id);
            }

            globalContext.objectMapper().writerWithDefaultPrettyPrinter().writeValue(wfFile, body);
            return Map.of("status", "saved");
        } catch (Exception e) {
            return Map.of("error", "Failed to save workflow: " + e.getMessage());
        }
    }

    /**
     * Delete a workflow directory.
     */
    @DeleteMapping("/workflow/{id}")
    public Map<String, String> deleteWorkflow(@PathVariable String id) {
        try {
            File dir = new File(globalContext.workspaceDir, id);
            if (!dir.exists()) {
                return Map.of("error", "Workflow not found: " + id);
            }

            deleteRecursively(dir);
            return Map.of("status", "deleted");
        } catch (Exception e) {
            return Map.of("error", "Failed to delete workflow: " + e.getMessage());
        }
    }

    /**
     * Find the examples directory, checking multiple locations.
     */
    private File findExamplesDirectory() {
        String cwd = System.getProperty("user.dir");
        // Direct: cwd/examples
        File direct = new File(cwd, "examples");
        if (direct.exists()) return direct;
        // Parent: cwd/../examples (common when running from orc-java/)
        File parent = new File(cwd).getParentFile();
        if (parent != null) {
            File parentExamples = new File(parent, "examples");
            if (parentExamples.exists()) return parentExamples;
            // Grandparent: cwd/../../examples
            File grandparent = parent.getParentFile();
            if (grandparent != null) {
                File grandExamples = new File(grandparent, "examples");
                if (grandExamples.exists()) return grandExamples;
            }
        }
        return null;
    }

    private void deleteRecursively(File file) {
        if (file.isDirectory()) {
            File[] children = file.listFiles();
            if (children != null) {
                for (File child : children) {
                    deleteRecursively(child);
                }
            }
        }
        file.delete();
    }
}
