package com.orc.model.config;

import java.util.Map;

public record BashConfig(
        Long timeout,
        BaseNodeConfig.RetryConfig retry,
        String script,
        String interpreter,
        ArgsPassing argsPassing,
        Map<String, String> envMapping
) {
    public record ArgsPassing(
            String type,
            Map<String, ArgMapping> argMapping,
            String fileName
    ) {
        public record ArgMapping(String type, Integer position, String template) {}
    }
}
