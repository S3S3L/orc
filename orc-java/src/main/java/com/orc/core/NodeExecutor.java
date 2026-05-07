package com.orc.core;

import com.orc.model.ExecutionContext;
import com.orc.model.NodeDefinition;

public interface NodeExecutor {
    Object execute(NodeDefinition node, java.util.Map<String, Object> inputs, ExecutionContext context) throws Exception;
}
