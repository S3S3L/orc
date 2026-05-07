package com.orc.model.config;

import java.util.Map;

public record NodeConfig(
        Long timeout,
        BaseNodeConfig.RetryConfig retry,
        String script,
        String runtime,
        ArgsPassing argsPassing
) {
    public record ArgsPassing(
            String type,
            Map<String, ArgMapping> argMapping,
            String fileName
    ) {
        public record ArgMapping(String type, Integer position) {}
    }
}
