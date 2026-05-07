package com.orc.core;

import com.orc.model.NodeDefinition;
import com.orc.model.NodeStatus;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.ReentrantLock;

public class NodeInstance {
    public final NodeDefinition definition;
    public final ReentrantLock lock;
    public final Map<String, Boolean> depends;
    public volatile NodeStatus status;

    public NodeInstance(NodeDefinition definition) {
        this.definition = definition;
        this.status = NodeStatus.pending;
        this.lock = new ReentrantLock();
        this.depends = new ConcurrentHashMap<>();
    }
}
