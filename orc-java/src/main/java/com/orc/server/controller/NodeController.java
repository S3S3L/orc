package com.orc.server.controller;

import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/nodes")
public class NodeController {

    @GetMapping("/{id}")
    public Object getNodeDetail(@PathVariable String id) {
        return Map.of("nodeId", id, "status", "not_implemented");
    }

    @PostMapping("/{id}/run")
    public Object runNode(@PathVariable String id) {
        return Map.of("nodeId", id, "status", "not_implemented");
    }

    @GetMapping("/{id}/claude-html")
    public Object getClaudeHtml(@PathVariable String id) {
        return "<html><body>Claude report for " + id + "</body></html>";
    }
}
