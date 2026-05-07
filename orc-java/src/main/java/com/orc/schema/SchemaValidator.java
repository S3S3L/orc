package com.orc.schema;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;

import java.io.File;
import java.io.InputStream;
import java.util.Set;

public class SchemaValidator {

    private static final JsonSchemaFactory FACTORY = JsonSchemaFactory
            .builder(JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V7))
            .build();

    private final JsonSchema graphSchema;

    public SchemaValidator() {
        try (InputStream is = getClass().getClassLoader().getResourceAsStream("graph-schema.json")) {
            if (is != null) {
                JsonNode schemaNode = new ObjectMapper().readTree(is);
                graphSchema = FACTORY.getSchema(schemaNode);
            } else {
                graphSchema = null;
            }
        } catch (Exception e) {
            throw new RuntimeException("Failed to load graph schema", e);
        }
    }

    public void validate(JsonNode workflowDef) {
        if (graphSchema == null) return;

        Set<ValidationMessage> violations = graphSchema.validate(workflowDef);
        if (!violations.isEmpty()) {
            String errors = String.join("; ",
                    violations.stream().map(ValidationMessage::getMessage).toList());
            throw new IllegalArgumentException("Workflow validation failed: " + errors);
        }
    }

    public void validateFile(File workflowFile) {
        try {
            JsonNode workflowDef = new ObjectMapper().readTree(workflowFile);
            validate(workflowDef);
        } catch (Exception e) {
            throw new RuntimeException("Failed to read workflow file: " + workflowFile, e);
        }
    }
}
