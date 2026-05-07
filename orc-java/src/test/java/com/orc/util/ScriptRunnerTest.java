package com.orc.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

@DisplayName("ScriptRunner - Apache Commons Exec 进程执行")
class ScriptRunnerTest {

    private ScriptRunner runner;

    @BeforeEach
    void setUp() {
        runner = new ScriptRunner();
    }

    @Nested
    @DisplayName("bash 脚本执行")
    class BashScriptExecution {

        @Test
        @DisplayName("应该执行成功的 bash 脚本")
        void shouldExecuteSuccessfulBashScript(@TempDir File tempDir) throws Exception {
            File script = createScript(tempDir, "#!/bin/bash\necho '{\"status\":\"success\"}'\nexit 0", "test.sh");

            ScriptRunner.Result result = runner.run(
                    "bash", new String[]{script.getAbsolutePath()},
                    tempDir.getAbsolutePath(), 10000, Map.of(), null);

            assertThat(result.success()).isTrue();
            assertThat(result.exitCode()).isZero();
            assertThat(result.stdout()).contains("success");
        }

        @Test
        @DisplayName("应该捕获失败的 bash 脚本退出码")
        void shouldCaptureFailedBashExitCode(@TempDir File tempDir) throws Exception {
            File script = createScript(tempDir, "#!/bin/bash\necho 'error occurred' >&2\nexit 1", "fail.sh");

            ScriptRunner.Result result = runner.run(
                    "bash", new String[]{script.getAbsolutePath()},
                    tempDir.getAbsolutePath(), 10000, Map.of(), null);

            assertThat(result.success()).isFalse();
            assertThat(result.exitCode()).isEqualTo(1);
            assertThat(result.stderr()).contains("error occurred");
        }

        @Test
        @DisplayName("应该传递 stdin 数据")
        void shouldPassStdinData(@TempDir File tempDir) throws Exception {
            File script = createScript(tempDir, "#!/bin/bash\ncat\n", "echo.sh");

            ScriptRunner.Result result = runner.run(
                    "bash", new String[]{script.getAbsolutePath()},
                    tempDir.getAbsolutePath(), 10000, Map.of(), "{\"key\":\"value\"}");

            assertThat(result.success()).isTrue();
            assertThat(result.stdout()).contains("key");
        }

        @Test
        @DisplayName("应该传递环境变量")
        void shouldPassEnvironmentVariables(@TempDir File tempDir) throws Exception {
            File script = createScript(tempDir, "#!/bin/bash\necho $TEST_VAR\n", "env.sh");

            ScriptRunner.Result result = runner.run(
                    "bash", new String[]{script.getAbsolutePath()},
                    tempDir.getAbsolutePath(), 10000, Map.of("TEST_VAR", "hello_world"), null);

            assertThat(result.success()).isTrue();
            assertThat(result.stdout()).contains("hello_world");
        }
    }

    @Nested
    @DisplayName("超时控制")
    class TimeoutControl {

        @Test
        @DisplayName("应该超时长时间运行的脚本")
        void shouldTimeoutLongRunningScript(@TempDir File tempDir) throws Exception {
            File script = createScript(tempDir, "#!/bin/bash\nsleep 10\n", "slow.sh");

            ScriptRunner.Result result = runner.run(
                    "bash", new String[]{script.getAbsolutePath()},
                    tempDir.getAbsolutePath(), 500, Map.of(), null);

            assertThat(result.success()).isFalse();
        }
    }

    @Nested
    @DisplayName("工作目录")
    class WorkingDirectory {

        @Test
        @DisplayName("应该在工作目录中执行")
        void shouldExecuteInWorkingDirectory(@TempDir File tempDir) throws Exception {
            File script = createScript(tempDir, "#!/bin/bash\npwd\n", "pwd.sh");

            ScriptRunner.Result result = runner.run(
                    "bash", new String[]{script.getAbsolutePath()},
                    tempDir.getAbsolutePath(), 10000, Map.of(), null);

            assertThat(result.success()).isTrue();
            assertThat(result.stdout()).contains(tempDir.getAbsolutePath());
        }
    }

    private File createScript(File dir, String content, String name) throws IOException {
        File script = new File(dir, name);
        Files.writeString(script.toPath(), content);
        script.setExecutable(true);
        return script;
    }
}
