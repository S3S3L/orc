package com.orc.model.config;

import java.util.Map;

public record PythonConfig(
        Long timeout,
        BaseNodeConfig.RetryConfig retry,
        String script,
        String interpreter,
        ArgsPassing argsPassing,
        Requirements requirements
) {
    public record ArgsPassing(
            String type,
            Map<String, ArgMapping> argMapping,
            String fileName
    ) {
        public record ArgMapping(String type, Integer position) {}
    }

    public record Requirements(String file, String[] packages) {}
}
