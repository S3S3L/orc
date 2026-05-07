package com.orc.server.controller;

import com.orc.server.GlobalContext;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1")
public class WorkflowController {

    private final GlobalContext globalContext;

    public WorkflowController(GlobalContext globalContext) {
        this.globalContext = globalContext;
    }

    @GetMapping("/workflow")
    public Object getWorkflow() {
        if (globalContext.lastWorkflow == null) {
            return Map.of("error", "No workflow loaded");
        }
        return globalContext.lastWorkflow;
    }
}
