package com.orc.server.controller;

import com.orc.model.WorkflowDefinition;
import com.orc.server.GlobalContext;
import com.orc.server.service.ExecutionService;
import com.orc.server.service.NodeDetailService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;

import java.io.File;
import java.nio.file.Files;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/nodes")
public class NodeController {

    private final GlobalContext globalContext;
    private final NodeDetailService nodeDetailService;
    private final ExecutionService executionService;

    public NodeController(GlobalContext globalContext, NodeDetailService nodeDetailService, ExecutionService executionService) {
        this.globalContext = globalContext;
        this.nodeDetailService = nodeDetailService;
        this.executionService = executionService;
    }

    // GET /api/v1/nodes/:id
    @GetMapping("/{id}")
    public Object getNodeDetail(
            @PathVariable("id") String id,
            @RequestParam(value = "sessionId", required = false, defaultValue = "") String sessionId
    ) {
        Object workflow = globalContext.lastWorkflow;
        if (workflow == null) {
            return Map.of("error", "No workflow loaded");
        }
        if (globalContext.outputDir == null || globalContext.auditDir == null) {
            return Map.of("error", "Directory paths not configured");
        }

        try {
            WorkflowDefinition wf = globalContext.objectMapper().convertValue(workflow, WorkflowDefinition.class);
            return nodeDetailService.getNodeDetail(id, sessionId, wf);
        } catch (Exception e) {
            return Map.of("error", e.getMessage());
        }
    }

    // POST /api/v1/nodes/:id/run
    @PostMapping("/{id}/run")
    public Object runNode(
            @PathVariable("id") String id,
            @RequestParam(value = "sessionId", required = false, defaultValue = "") String sessionId,
            @RequestParam(value = "single", required = false, defaultValue = "false") boolean single
    ) {
        Object workflow = globalContext.lastWorkflow;
        if (workflow == null) {
            return Map.of("error", "No workflow loaded");
        }

        if (single && !sessionId.isEmpty()) {
            executionService.deleteNodeOutput(id, sessionId);
        }

        WorkflowDefinition wf = globalContext.objectMapper().convertValue(workflow, WorkflowDefinition.class);
        String newSessionId = executionService.startWorkflow(
                wf, false, sessionId.isEmpty() ? null : sessionId, single ? id : null, single);

        return Map.of("sessionId", newSessionId);
    }

    // GET /api/v1/nodes/:id/claude-html
    @GetMapping(value = "/{id}/claude-html", produces = MediaType.TEXT_HTML_VALUE)
    public String getClaudeHtml(
            @PathVariable("id") String id,
            @RequestParam(value = "sessionId", required = false, defaultValue = "") String sessionId
    ) throws Exception {
        if (globalContext.outputDir == null) {
            return "<html><body>Output directory not configured</body></html>";
        }

        File htmlDir = new File(globalContext.outputDir, sessionId);
        if (!htmlDir.isDirectory()) {
            return "<html><body>HTML export not found</body></html>";
        }

        File[] files = htmlDir.listFiles((d, name) ->
                name.startsWith("claude_code_") && name.endsWith("_" + id + ".html"));

        if (files == null || files.length == 0) {
            return "<html><body>HTML export not found</body></html>";
        }

        return Files.readString(files[0].toPath());
    }
}
