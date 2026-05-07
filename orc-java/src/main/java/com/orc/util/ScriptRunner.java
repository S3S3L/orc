package com.orc.util;

import org.apache.commons.exec.CommandLine;
import org.apache.commons.exec.DefaultExecutor;
import org.apache.commons.exec.ExecuteWatchdog;
import org.apache.commons.exec.PumpStreamHandler;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.util.Map;

/**
 * Wraps Apache Commons Exec to match execa semantics from TS version.
 */
public class ScriptRunner {

    public record Result(int exitCode, String stdout, String stderr, String combined) {
        public boolean success() {
            return exitCode == 0;
        }
    }

    public Result run(String command, String[] args, String cwd, long timeoutMs,
                      Map<String, String> env, String stdinData) throws Exception {
        CommandLine cmdLine = new CommandLine(command);
        if (args != null) {
            for (String arg : args) {
                cmdLine.addArgument(arg, false);
            }
        }

        DefaultExecutor executor = new DefaultExecutor();
        if (cwd != null) {
            executor.setWorkingDirectory(new File(cwd));
        }

        ByteArrayOutputStream stdout = new ByteArrayOutputStream();
        ByteArrayOutputStream stderr = new ByteArrayOutputStream();
        ByteArrayInputStream stdin = stdinData != null ? new ByteArrayInputStream(stdinData.getBytes()) : null;

        PumpStreamHandler streamHandler = new PumpStreamHandler(stdout, stderr, stdin);
        executor.setStreamHandler(streamHandler);

        if (timeoutMs > 0) {
            executor.setWatchdog(new ExecuteWatchdog(timeoutMs));
        }

        Map<String, String> execEnv = env != null ? env : System.getenv();

        int exitCode;
        try {
            exitCode = executor.execute(cmdLine, execEnv);
        } catch (org.apache.commons.exec.ExecuteException e) {
            exitCode = e.getExitValue();
        }

        return new Result(
                exitCode,
                stdout.toString().trim(),
                stderr.toString().trim(),
                stdout.toString().trim() + "\n" + stderr.toString().trim()
        );
    }
}
