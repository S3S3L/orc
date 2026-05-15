package com.orc.model.config;

public record FileNodeConfig(
        Long timeout,
        BaseNodeConfig.RetryConfig retry,
        String filePath
) {
}
