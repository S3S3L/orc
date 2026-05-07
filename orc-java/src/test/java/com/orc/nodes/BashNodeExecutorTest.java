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

@DisplayName("BashNodeExecutor - Shell 脚本节点执行")
class BashNodeExecutorTest {

    private BashNodeExecutor executor;

    @BeforeEach
    void setUp() {
        executor = new BashNodeExecutor();
    }

    @Nested
    @DisplayName("JSON 输出解析")
    class JsonOutputParsing {

        @Test
        @DisplayName("应该解析有效的 JSON 输出")
        void shouldParseValidJsonOutput(@TempDir File tempDir) throws Exception {
            File script = createScript(tempDir, "#!/bin/bash\n", "json.sh");
            appendToFile(script, "echo '{\"status\":\"success\",\"count\":42}'\n");

            Object result = executeBashScript(tempDir, script);

            assertThat(result).isInstanceOf(Map.class);
            @SuppressWarnings("unchecked")
            Map<String, Object> map = (Map<String, Object>) result;
            assertThat(map).containsEntry("status", "success");
            assertThat(map).containsEntry("count", 42);
        }

        @Test
        @DisplayName("应该拒绝非 JSON 输出")
        void shouldRejectNonJsonOutput(@TempDir File tempDir) throws Exception {
            File script = createScript(tempDir, "#!/bin/bash\necho 'not valid json'\n", "invalid.sh");

            assertThatThrownBy(() -> executeBashScript(tempDir, script))
                    .hasMessageContaining("not valid JSON");
        }
    }

    @Nested
    @DisplayName("错误处理")
    class ErrorHandling {

        @Test
        @DisplayName("应该返回执行失败当脚本退出码非零")
        void shouldFailOnNonZeroExitCode(@TempDir File tempDir) throws Exception {
            File script = createScript(tempDir, "#!/bin/bash\necho 'fail' >&2\nexit 1\n", "fail.sh");

            assertThatThrownBy(() -> executeBashScript(tempDir, script))
                    .hasMessageContaining("failed with exit code 1");
        }

        @Test
        @DisplayName("应该处理脚本不存在的情况")
        void shouldHandleMissingScript(@TempDir File tempDir) {
            File nonExistent = new File(tempDir, "nonexistent.sh");

            assertThatThrownBy(() -> executeBashScript(tempDir, nonExistent))
                    .hasMessageContaining("failed with exit code");
        }
    }

    @Nested
    @DisplayName("环境变量传递")
    class EnvPassing {

        @Test
        @DisplayName("应该设置 WORKFLOW_HOME 环境变量")
        void shouldSetWorkflowHome(@TempDir File tempDir) throws Exception {
            File script = createScript(tempDir, "#!/bin/bash\n", "env.sh");
            appendToFile(script, "echo \"{\\\"workflow_home\\\":\\\"$WORKFLOW_HOME\\\"}\"\n");

            Object result = executeBashScript(tempDir, script);

            assertThat(result).isInstanceOf(Map.class);
        }
    }

    // ---- Helpers ----

    private File createScript(File dir, String content, String name) throws Exception {
        File script = new File(dir, name);
        Files.writeString(script.toPath(), content);
        script.setExecutable(true);
        return script;
    }

    private void appendToFile(File file, String content) throws Exception {
        Files.writeString(file.toPath(), content, java.nio.file.StandardOpenOption.APPEND);
    }

    private Object executeBashScript(File tempDir, File script) throws Exception {
        NodeDefinition nodeDef = new NodeDefinition(
                "test-node", NodeType.bash, "Test", null, null,
                Map.of(),
                Map.of(
                        "script", script.getAbsolutePath(),
                        "argsPassing", Map.of("type", "stdin")
                ));

        ExecutionContext context = new ExecutionContext(
                new WorkflowDefinition("1.0", "test", null, null, null, List.of(), List.of()),
                tempDir.getAbsolutePath(), tempDir.getAbsolutePath(), tempDir.getAbsolutePath(),
                tempDir.getAbsolutePath(), "test-session", false);

        return executor.execute(nodeDef, Map.of(), context);
    }
}
