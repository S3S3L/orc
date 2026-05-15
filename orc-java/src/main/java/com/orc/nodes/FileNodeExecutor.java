package com.orc.nodes;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.core.NodeExecutor;
import com.orc.model.ExecutionContext;
import com.orc.model.NodeDefinition;

import java.io.File;

public class FileNodeExecutor implements NodeExecutor {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Object execute(NodeDefinition node, java.util.Map<String, Object> inputs, ExecutionContext context) throws Exception {
        java.util.Map<String, Object> configMap = node.config();
        String filePath = (String) configMap.get("filePath");

        if (filePath == null || filePath.isBlank()) {
            throw new IllegalArgumentException("Node " + node.id() + ": filePath config is required");
        }

        File file = new File(filePath);
        if (!file.isAbsolute()) {
            file = new File(context.workflowDir(), filePath);
        }

        if (!file.exists()) {
            throw new java.io.FileNotFoundException("Node " + node.id() + ": file not found: " + file.getAbsolutePath());
        }

        return objectMapper.readValue(file, Object.class);
    }
}
