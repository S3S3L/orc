package com.orc.server.controller;

import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SpaFallbackController {

    private static final Resource INDEX = new ClassPathResource("static/index.html");

    @GetMapping(value = {
        "/serve",
        "/session", "/session/**"
    })
    public Resource spa() {
        return INDEX;
    }
}
