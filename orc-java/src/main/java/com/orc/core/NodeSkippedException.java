package com.orc.core;

public class NodeSkippedException extends RuntimeException {
    private final String nodeId;

    public NodeSkippedException(String nodeId) {
        super("Node " + nodeId + ": skipped due to condition");
        this.nodeId = nodeId;
    }

    public String getNodeId() {
        return nodeId;
    }
}
