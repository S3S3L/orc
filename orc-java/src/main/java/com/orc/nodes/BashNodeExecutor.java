package com.orc.nodes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.core.NodeExecutor;
import com.orc.model.ExecutionContext;
import com.orc.model.NodeDefinition;
import com.orc.model.config.BashConfig;
import com.orc.util.ScriptRunner;

import java.io.File;
import java.nio.file.Files;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class BashNodeExecutor implements NodeExecutor {

    private final ScriptRunner scriptRunner = new ScriptRunner();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Object execute(NodeDefinition node, Map<String, Object> inputs, ExecutionContext context) throws Exception {
        Map<String, Object> configMap = node.config();
        String script = (String) configMap.get("script");
        String interpreter = (String) configMap.getOrDefault("interpreter", "bash");

        // Resolve script path
        File scriptFile = new File(script);
        if (!scriptFile.isAbsolute()) {
            scriptFile = new File(context.workflowDir(), script);
        }

        // Build command arguments
        Map<String, Object> argsPassing = (Map<String, Object>) configMap.get("argsPassing");
        String passingType = (String) argsPassing.get("type");

        // Always pass script as first argument
        var cmdArgs = new java.util.ArrayList<String>();
        cmdArgs.add(scriptFile.getAbsolutePath());

        String stdinData = null;
        Map<String, String> env = new HashMap<>();

        env.put("WORKFLOW_HOME", context.workflowDir());

        switch (passingType) {
            case "stdin" -> {
                stdinData = objectMapper.writeValueAsString(inputs);
            }
            case "args" -> {
                Map<String, Object> argMapping = (Map<String, Object>) argsPassing.get("argMapping");
                if (argMapping != null) {
                    String[] argArray = new String[argMapping.size()];
                    for (Map.Entry<String, Object> entry : argMapping.entrySet()) {
                        Map<String, Object> mapping = (Map<String, Object>) entry.getValue();
                        String inputName = entry.getKey();
                        Object value = inputs.get(inputName);

                        String mappingType = (String) mapping.get("type");
                        Integer position = (Integer) mapping.get("position");

                        if ("string".equals(mappingType)) {
                            argArray[position != null ? position : argArray.length - 1] = String.valueOf(value);
                        } else if ("file".equals(mappingType)) {
                            String fileName = "input_" + inputName + ".txt";
                            File filePath = new File(context.tempBaseDir(), fileName);
                            Files.writeString(filePath.toPath(), String.valueOf(value));
                            argArray[position != null ? position : argArray.length - 1] = filePath.getAbsolutePath();
                        } else if ("raw".equals(mappingType)) {
                            String template = (String) mapping.getOrDefault("template", "{{value}}");
                            argArray[position != null ? position : argArray.length - 1] = template.replace("{{value}}", String.valueOf(value));
                        }
                    }
                    cmdArgs.addAll(java.util.List.of(argArray));
                }
            }
            case "file" -> {
                String fileName = (String) argsPassing.getOrDefault("fileName", "input.json");
                File inputFilePath = new File(context.tempBaseDir(), fileName);
                objectMapper.writerWithDefaultPrettyPrinter().writeValue(inputFilePath, inputs);
                cmdArgs.add(inputFilePath.getAbsolutePath());
            }
        }

        // Environment mapping
        Map<String, String> envMapping = (Map<String, String>) configMap.get("envMapping");
        if (envMapping != null) {
            for (Map.Entry<String, String> entry : envMapping.entrySet()) {
                Object value = inputs.get(entry.getValue());
                if (value != null) {
                    env.put(entry.getKey(), String.valueOf(value));
                }
            }
        }

        Long timeout = (Long) configMap.get("timeout");
        ScriptRunner.Result result = scriptRunner.run(
                interpreter, cmdArgs.toArray(new String[0]), context.tempBaseDir(),
                timeout != null ? timeout : 300000, env, stdinData);

        if (!result.success()) {
            throw new RuntimeException("Node " + node.id() + ": script failed with exit code " + result.exitCode() + "\n" + result.combined());
        }

        // Parse JSON output
        try {
            return objectMapper.readValue(result.stdout(), Object.class);
        } catch (Exception e) {
            throw new RuntimeException("Node " + node.id() + ": script output is not valid JSON: " + result.stdout().substring(0, Math.min(200, result.stdout().length())));
        }
    }
}
