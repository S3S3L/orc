package com.orc.schema;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.model.WorkflowDefinition.SchemaEntry;

import java.io.File;
import java.util.HashMap;
import java.util.Map;

public class SchemaLoader {

    private final String graphDir;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public SchemaLoader(String graphDir) {
        this.graphDir = graphDir;
    }

    public Map<String, SchemaEntry> loadSchemas(Map<String, SchemaEntry> existingSchemas, String[] schemaBaseDirs) {
        Map<String, SchemaEntry> schemas = existingSchemas != null ? new HashMap<>(existingSchemas) : new HashMap<>();

        if (schemaBaseDirs == null) return schemas;

        for (String dir : schemaBaseDirs) {
            File schemaDir = new File(graphDir, dir);
            if (!schemaDir.isDirectory()) continue;

            File[] files = schemaDir.listFiles((d, name) -> name.endsWith(".json"));
            if (files == null) continue;

            for (File file : files) {
                try {
                    String fileNameWithoutExt = file.getName().replace(".json", "");
                    if (!schemas.containsKey(fileNameWithoutExt)) {
                        JsonNode content = objectMapper.readTree(file);
                        String relativePath = dir + "/" + file.getName();
                        schemas.put(fileNameWithoutExt, new SchemaEntry(relativePath, content));
                    }
                } catch (Exception e) {
                    throw new RuntimeException("Failed to load schema file " + file.getName() + ": " + e.getMessage(), e);
                }
            }
        }

        return schemas;
    }

    public JsonNode loadSchemaContent(SchemaEntry entry) {
        if (entry.content() != null) return entry.content();
        if (entry.file() == null) return null;

        try {
            File schemaFile = new File(graphDir, entry.file());
            return objectMapper.readTree(schemaFile);
        } catch (Exception e) {
            throw new RuntimeException("Failed to load schema file " + entry.file() + ": " + e.getMessage(), e);
        }
    }
}
