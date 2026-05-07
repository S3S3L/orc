package com.orc.server.controller;

import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/loops")
public class LoopController {

    @GetMapping("/{id}/subgraph")
    public Object getLoopSubgraph(@PathVariable String id) {
        return Map.of("loopId", id, "status", "not_implemented");
    }
}
