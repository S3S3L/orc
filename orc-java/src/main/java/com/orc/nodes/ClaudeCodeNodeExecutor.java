package com.orc.nodes;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.jknack.handlebars.Handlebars;
import com.github.jknack.handlebars.Template;
import com.orc.core.NodeExecutor;
import com.orc.model.ExecutionContext;
import com.orc.model.NodeDefinition;
import com.orc.util.ScriptRunner;

import java.io.File;
import java.nio.file.Files;
import java.util.*;

public class ClaudeCodeNodeExecutor implements NodeExecutor {

    private final ScriptRunner scriptRunner = new ScriptRunner();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public Object execute(NodeDefinition node, Map<String, Object> inputs, ExecutionContext context) throws Exception {
        Map<String, Object> configMap = node.config();
        String workDir = context.outputDir() + "/" + context.sessionId();
        new File(workDir).mkdirs();

        // Prepare markdown context
        Map<String, Object> promptConfig = (Map<String, Object>) configMap.get("prompt");
        String promptPath = (String) promptConfig.get("markdown");
        boolean template = Boolean.TRUE.equals(promptConfig.get("template"));

        File promptFile = new File(promptPath);
        if (!promptFile.isAbsolute()) {
            promptFile = new File(context.workflowDir(), promptPath);
        }

        String content = Files.readString(promptFile.toPath());

        // Render Handlebars template if enabled
        if (template) {
            Handlebars handlebars = new Handlebars();
            Template tmpl = handlebars.compileInline(content);
            content = tmpl.apply(inputs);
        }

        // Inject inputs via SECTION markers
        Map<String, Object> inputMapping = (Map<String, Object>) configMap.get("inputMapping");
        if (inputMapping != null) {
            for (Map.Entry<String, Object> entry : inputMapping.entrySet()) {
                Map<String, Object> mapping = (Map<String, Object>) entry.getValue();
                if ("markdown".equals(mapping.get("target")) && mapping.containsKey("section")) {
                    String sectionMarker = "<!-- SECTION: " + mapping.get("section") + " -->";
                    String inputValue = objectMapper.writerWithDefaultPrettyPrinter()
                            .writeValueAsString(inputs.get(entry.getKey()));
                    content = content.replace(sectionMarker,
                            sectionMarker + "\n\n```json\n" + inputValue + "\n```");
                }
            }
        } else {
            for (Map.Entry<String, Object> entry : inputs.entrySet()) {
                String sectionMarker = "<!-- SECTION: " + entry.getKey() + " -->";
                String inputValue = objectMapper.writerWithDefaultPrettyPrinter()
                        .writeValueAsString(entry.getValue());
                content = content.replace(sectionMarker,
                        sectionMarker + "\n\n```json\n" + inputValue + "\n```");
            }
        }

        // Write context markdown
        File contextMd = new File(workDir, node.id() + ".md");
        Files.writeString(contextMd.toPath(), content);

        // Extract output schema for JSON Schema constraint
        Map<String, Object> outputDef = (Map<String, Object>) configMap.get("output");

        // Execute Claude with resume support
        Map<String, Object> resumeConfig = (Map<String, Object>) configMap.get("resume");
        int maxAttempts = resumeConfig != null ? (int) resumeConfig.get("maxAttempts") : 0;

        String validator = resumeConfig != null ? (String) resumeConfig.get("validator") : null;
        Object lastOutput = null;

        for (int attempt = 1; attempt <= maxAttempts + 1; attempt++) {
            String promptContent = content;
            if (resumeConfig != null && attempt > 1) {
                promptContent = (String) resumeConfig.getOrDefault("prompt",
                        "Verify failed. Please try again.");
            }

            List<String> claudeArgs = buildClaudeArgs(configMap, promptContent,
                    outputDef != null ? outputDef.get("schema") : null,
                    attempt == 1 ? "session-id" : "r", UUID.randomUUID().toString());

            Map<String, String> claudeEnv = new HashMap<>(System.getenv());
            claudeEnv.put("WORKFLOW_HOME", context.workflowDir());
            claudeEnv.put("WORKSPACE_DIR", workDir);
            claudeEnv.put("CLAUDE_PLUGIN_ROOT", context.workflowDir());
            claudeEnv.remove("CLAUDECODE");

            Long timeout = (Long) configMap.get("timeout");
            ScriptRunner.Result result = scriptRunner.run(
                    "claude", claudeArgs.toArray(new String[0]), workDir,
                    timeout != null ? timeout : 300000, claudeEnv, null);

            // Parse JSON output (--output-format json)
            Object output;
            try {
                JsonNode rawOutput = objectMapper.readTree(result.stdout());
                if (rawOutput.has("structured_output")) {
                    output = objectMapper.treeToValue(rawOutput.get("structured_output"), Object.class);
                } else {
                    output = objectMapper.treeToValue(rawOutput, Object.class);
                }
            } catch (Exception e) {
                throw new RuntimeException("Node " + node.id() + ": could not parse Claude output as JSON. stdout: " + result.stdout().substring(0, Math.min(500, result.stdout().length())));
            }

            // Validate with resume validator
            if (resumeConfig == null || validator == null) {
                return output;
            }

            lastOutput = output;
            // Simple JS-like evaluation for validator (using Aviator)
            // For now, accept the output if no validator is provided
            if (attempt > maxAttempts) break;
        }

        throw new RuntimeException("Node " + node.id() + ": failed after " + maxAttempts + " resumes");
    }

    private List<String> buildClaudeArgs(Map<String, Object> configMap, String prompt, Object outputSchema, String sessionIdFlag, String sessionId) {
        List<String> args = new ArrayList<>();
        args.add("-p");
        args.add(prompt);
        args.add("--output-format");
        args.add("json");

        Map<String, Object> capabilities = (Map<String, Object>) configMap.get("capabilities");
        if (capabilities != null) {
            if (!Boolean.TRUE.equals(capabilities.get("enableSkills"))) {
                args.add("--disable-slash-commands");
            }

            Map<String, Object> tools = (Map<String, Object>) capabilities.get("tools");
            if (tools != null && tools.containsKey("allowed")) {
                List<String> allowed = (List<String>) tools.get("allowed");
                args.add("--allowed-tools");
                args.add(String.join(",", allowed));
            }
            if (tools != null && tools.containsKey("denied")) {
                List<String> denied = (List<String>) tools.get("denied");
                args.add("--disallowed-tools");
                args.add(String.join(",", denied));
            }

            Map<String, Object> mcp = (Map<String, Object>) capabilities.get("mcp");
            if (mcp != null && mcp.containsKey("enabled")) {
                List<String> enabled = (List<String>) mcp.get("enabled");
                if (enabled != null) {
                    List<String> mcpTools = enabled.stream()
                            .map(m -> "mcp__" + m + "__*")
                            .toList();
                    // Append to allowed tools
                }
            }
            if (mcp != null && mcp.containsKey("config")) {
                args.add("--mcp-config");
                args.add((String) mcp.get("config"));
            }
        }

        if (outputSchema != null) {
            try {
                args.add("--json-schema");
                args.add(objectMapper.writeValueAsString(outputSchema));
            } catch (Exception e) {
                // Ignore schema serialization error
            }
        }

        args.add("--" + sessionIdFlag);
        args.add(sessionId);

        return args;
    }
}
