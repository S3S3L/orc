package com.orc.model.config;

public record BaseNodeConfig(
        Long timeout,
        RetryConfig retry
) {
    public record RetryConfig(Integer maxAttempts, String backoff, Long delayMs) {}
}
