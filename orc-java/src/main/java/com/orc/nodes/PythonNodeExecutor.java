package com.orc.nodes;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.core.NodeExecutor;
import com.orc.model.ExecutionContext;
import com.orc.model.NodeDefinition;
import com.orc.util.ScriptRunner;

import java.io.File;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;

public class PythonNodeExecutor implements NodeExecutor {

    private final ScriptRunner scriptRunner = new ScriptRunner();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Object execute(NodeDefinition node, Map<String, Object> inputs, ExecutionContext context) throws Exception {
        Map<String, Object> configMap = node.config();
        String script = (String) configMap.get("script");
        String interpreter = (String) configMap.getOrDefault("interpreter", "python3");

        // Resolve script path
        File scriptFile = new File(script);
        if (!scriptFile.isAbsolute()) {
            scriptFile = new File(context.workflowDir(), script);
        }

        // Build command arguments
        Map<String, Object> argsPassing = (Map<String, Object>) configMap.getOrDefault("argsPassing", Map.of("type", "stdin"));
        String passingType = (String) argsPassing.get("type");

        java.util.List<String> args = new java.util.ArrayList<>();
        args.add(scriptFile.getAbsolutePath());
        String stdinData = null;

        switch (passingType) {
            case "stdin" -> stdinData = objectMapper.writeValueAsString(inputs);
            case "args" -> {
                Map<String, Object> argMapping = (Map<String, Object>) argsPassing.get("argMapping");
                if (argMapping != null) {
                    for (Map.Entry<String, Object> entry : argMapping.entrySet()) {
                        Map<String, Object> mapping = (Map<String, Object>) entry.getValue();
                        Object value = inputs.get(entry.getKey());
                        String mappingType = (String) mapping.get("type");

                        if ("string".equals(mappingType)) {
                            args.add(String.valueOf(value));
                        } else if ("file".equals(mappingType)) {
                            String fileName = "input_" + entry.getKey() + ".txt";
                            File filePath = new File(context.tempBaseDir(), fileName);
                            Files.writeString(filePath.toPath(), String.valueOf(value));
                            args.add(filePath.getAbsolutePath());
                        }
                    }
                }
            }
            case "file" -> {
                String fileName = (String) argsPassing.getOrDefault("fileName", "input.json");
                File inputFilePath = new File(context.tempBaseDir(), fileName);
                objectMapper.writerWithDefaultPrettyPrinter().writeValue(inputFilePath, inputs);
                args.add(inputFilePath.getAbsolutePath());
            }
        }

        Long timeout = (Long) configMap.get("timeout");
        Map<String, String> env = Map.of("WORKFLOW_HOME", context.workflowDir());

        ScriptRunner.Result result = scriptRunner.run(
                interpreter, args.toArray(new String[0]), context.tempBaseDir(),
                timeout != null ? timeout : 300000, env, stdinData);

        if (!result.success()) {
            throw new RuntimeException("Node " + node.id() + ": script failed with exit code " + result.exitCode() + "\n" + result.combined());
        }

        try {
            return objectMapper.readValue(result.stdout(), Object.class);
        } catch (Exception e) {
            throw new RuntimeException("Node " + node.id() + ": script output is not valid JSON: " + result.stdout().substring(0, Math.min(200, result.stdout().length())));
        }
    }
}
