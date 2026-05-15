package com.orc.nodes;

import com.orc.model.ExecutionContext;
import com.orc.model.NodeDefinition;
import com.orc.model.NodeType;
import com.orc.model.WorkflowDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.file.Files;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

@DisplayName("FileNodeExecutor - 文件读取节点执行")
class FileNodeExecutorTest {

    private FileNodeExecutor executor;

    @BeforeEach
    void setUp() {
        executor = new FileNodeExecutor();
    }

    @Nested
    @DisplayName("JSON 文件读取")
    class JsonFileReading {

        @Test
        @DisplayName("应该读取并解析 workflowDir 下的相对路径 JSON 文件")
        void shouldReadRelativePathJsonFile(@TempDir File tempDir) throws Exception {
            File jsonFile = new File(tempDir, "data.json");
            Files.writeString(jsonFile.toPath(), "{\"key\":\"value\",\"number\":123}");

            Object result = executeFileNode(tempDir, "data.json");

            assertThat(result).isInstanceOf(Map.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) result;
            assertThat(map).containsEntry("key", "value");
            assertThat(map).containsEntry("number", 123);
        }

        @Test
        @DisplayName("应该读取并解析绝对路径 JSON 文件")
        void shouldReadAbsolutePathJsonFile(@TempDir File tempDir) throws Exception {
            File jsonFile = new File(tempDir, "absolute.json");
            Files.writeString(jsonFile.toPath(), "{\"status\":\"ok\"}");

            NodeDefinition nodeDef = new NodeDefinition(
                    "test-node", NodeType.file, "Test", null, null,
                    Map.of(),
                    Map.of("filePath", jsonFile.getAbsolutePath()));

            ExecutionContext context = new ExecutionContext(
                    new WorkflowDefinition("1.0", "test", null, null, null, List.of(), List.of()),
                    tempDir.getAbsolutePath(), tempDir.getAbsolutePath(), tempDir.getAbsolutePath(),
                    tempDir.getAbsolutePath(), "test-session", false);

            Object result = executor.execute(nodeDef, Map.of(), context);

            assertThat(result).isInstanceOf(Map.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) result;
            assertThat(map).containsEntry("status", "ok");
        }

        @Test
        @DisplayName("应该解析复杂嵌套的 JSON")
        void shouldParseNestedJson(@TempDir File tempDir) throws Exception {
            String json = """
                    {
                      "users": [
                        {"name": "Alice", "age": 30},
                        {"name": "Bob", "age": 25}
                      ],
                      "meta": {"total": 2}
                    }
                    """;
            File jsonFile = new File(tempDir, "complex.json");
            Files.writeString(jsonFile.toPath(), json);

            Object result = executeFileNode(tempDir, "complex.json");

            assertThat(result).isInstanceOf(Map.class);
        }
    }

    @Nested
    @DisplayName("错误处理")
    class ErrorHandling {

        @Test
        @DisplayName("应该在文件不存在时抛出 FileNotFoundException")
        void shouldFailOnMissingFile(@TempDir File tempDir) {
            assertThatThrownBy(() -> executeFileNode(tempDir, "nonexistent.json"))
                    .hasMessageContaining("file not found");
        }

        @Test
        @DisplayName("应该在 filePath 为空时抛出 IllegalArgumentException")
        void shouldFailOnEmptyFilePath(@TempDir File tempDir) {
            NodeDefinition nodeDef = new NodeDefinition(
                    "test-node", NodeType.file, "Test", null, null,
                    Map.of(),
                    Map.of("filePath", ""));

            ExecutionContext context = new ExecutionContext(
                    new WorkflowDefinition("1.0", "test", null, null, null, List.of(), List.of()),
                    tempDir.getAbsolutePath(), tempDir.getAbsolutePath(), tempDir.getAbsolutePath(),
                    tempDir.getAbsolutePath(), "test-session", false);

            assertThatThrownBy(() -> executor.execute(nodeDef, Map.of(), context))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("filePath config is required");
        }

        @Test
        @DisplayName("应该在 filePath 为 null 时抛出 IllegalArgumentException")
        void shouldFailOnNullFilePath(@TempDir File tempDir) {
            NodeDefinition nodeDef = new NodeDefinition(
                    "test-node", NodeType.file, "Test", null, null,
                    Map.of(),
                    Map.of());

            ExecutionContext context = new ExecutionContext(
                    new WorkflowDefinition("1.0", "test", null, null, null, List.of(), List.of()),
                    tempDir.getAbsolutePath(), tempDir.getAbsolutePath(), tempDir.getAbsolutePath(),
                    tempDir.getAbsolutePath(), "test-session", false);

            assertThatThrownBy(() -> executor.execute(nodeDef, Map.of(), context))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("filePath config is required");
        }

        @Test
        @DisplayName("应该在 JSON 格式无效时抛出解析错误")
        void shouldFailOnInvalidJson(@TempDir File tempDir) throws Exception {
            File jsonFile = new File(tempDir, "invalid.json");
            Files.writeString(jsonFile.toPath(), "{not valid json}");

            assertThatThrownBy(() -> executeFileNode(tempDir, "invalid.json"))
                    .hasMessageContaining("Unexpected character");
        }
    }

    // ---- Helpers ----

    private Object executeFileNode(File workflowDir, String filePath) throws Exception {
        NodeDefinition nodeDef = new NodeDefinition(
                "test-node", NodeType.file, "Test", null, null,
                Map.of(),
                Map.of("filePath", filePath));

        ExecutionContext context = new ExecutionContext(
                new WorkflowDefinition("1.0", "test", null, null, null, List.of(), List.of()),
                workflowDir.getAbsolutePath(), workflowDir.getAbsolutePath(), workflowDir.getAbsolutePath(),
                workflowDir.getAbsolutePath(), "test-session", false);

        return executor.execute(nodeDef, Map.of(), context);
    }
}
