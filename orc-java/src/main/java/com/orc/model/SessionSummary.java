package com.orc.model;

import java.util.Map;

public record SessionSummary(
        String id,
        String workflowName,
        String status,
        long startTime,
        Long endTime,
        int nodeCount,
        Map<String, String> nodeStatuses
) {}
