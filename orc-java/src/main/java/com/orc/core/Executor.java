package com.orc.core;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.model.*;
import com.orc.model.ExecutionContext.NodeDebugContext;
import com.orc.runtime.AuditLogger;
import com.orc.schema.SchemaLoader;
import com.orc.util.ConditionEvaluator;
import io.github.s3s3l.yggdrasil.promise.Promise;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.locks.ReentrantLock;

public class Executor {

    private static final Logger log = LoggerFactory.getLogger(Executor.class);
    private static final int DEFAULT_MAX_RETRY_ATTEMPTS = 1;
    private static final int DEFAULT_RETRY_DELAY_MS = 1000;

    private final WorkflowGraph graph;
    private final ExecutionContext context;
    private final AuditLogger audit;
    private final Map<String, NodeExecutor> executors = new HashMap<>();
    private final Map<String, NodeInstance> nodes = new ConcurrentHashMap<>();
    private final Map<String, Object> startInputs;
    private final ConditionEvaluator conditionEvaluator = new ConditionEvaluator();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public Executor(WorkflowGraph graph, ExecutionContext context) {
        this(graph, context, Map.of());
    }

    public Executor(WorkflowGraph graph, ExecutionContext context, Map<String, Object> startInputs) {
        this.graph = graph;
        this.context = context;
        this.startInputs = new HashMap<>(startInputs);
        this.audit = new AuditLogger(context.auditDir());
        registerBuiltInExecutors();
    }

    private void registerBuiltInExecutors() {
        try {
            executors.put("bash", (NodeExecutor) Class.forName("com.orc.nodes.BashNodeExecutor").getDeclaredConstructor().newInstance());
            executors.put("python", (NodeExecutor) Class.forName("com.orc.nodes.PythonNodeExecutor").getDeclaredConstructor().newInstance());
            executors.put("node", (NodeExecutor) Class.forName("com.orc.nodes.NodeNodeExecutor").getDeclaredConstructor().newInstance());
            executors.put("claude-code", (NodeExecutor) Class.forName("com.orc.nodes.ClaudeCodeNodeExecutor").getDeclaredConstructor().newInstance());
            executors.put("loop", (NodeExecutor) Class.forName("com.orc.nodes.LoopNodeExecutor").getDeclaredConstructor().newInstance());
            executors.put("file", (NodeExecutor) Class.forName("com.orc.nodes.FileNodeExecutor").getDeclaredConstructor().newInstance());
        } catch (Exception e) {
            log.warn("Failed to register some node executors: {}", e.getMessage());
        }
    }

    public void registerExecutor(String type, NodeExecutor executor) {
        executors.put(type, executor);
    }

    public Map<String, NodeInstance> getNodes() {
        return nodes;
    }

    /**
     * Execute the workflow. If startNodeId is set, resume from that node.
     */
    public Map<String, Object> execute(ExecutionState state) {
        NodeDebugContext debug = context.debug();
        if (debug.startNodeId() == null) {
            newExecute(state);
        } else {
            startFrom(state, debug.startNodeId(), debug.single());
        }
        return new HashMap<>(context.nodeOutputs());
    }

    private void newExecute(ExecutionState state) {
        initializeDirectories();

        for (String nodeId : graph.getAllValidNodes()) {
            initNodeInstance(nodeId);
        }

        log.info("[{}] Starting workflow execution with {} nodes", context.sessionId(), nodes.size());

        List<String> rootNodes = graph.getRootNodes();
        @SuppressWarnings("unchecked")
        Promise<Void>[] rootPromises = rootNodes.stream()
                .map(nid -> Promise.<Void>async(() -> {
                    executeNode(nid, "root", context, state, false);
                    return null;
                }))
                .toArray(Promise[]::new);

        Promise<Object[]> allRoot = Promise.all(rootPromises);
        try {
            allRoot.get();
        } catch (Exception e) {
            throw new RuntimeException("Workflow execution failed", e);
        }
    }

    private void startFrom(ExecutionState state, String startNodeId, boolean single) {
        for (String nodeId : graph.getAllDownstreamNodes(startNodeId)) {
            initNodeInstance(nodeId);
        }

        initNodeInstance(startNodeId);

        NodeInstance node = nodes.get(startNodeId);
        List<Promise<Void>> preloadPromises = new ArrayList<>();

        for (String upstreamId : graph.getDirectUpstreamNodes(startNodeId)) {
            preloadPromises.add(Promise.<Void>async(() -> {
                String tempDir = createTempDir(context, upstreamId);
                AuditEntry auditEntry = audit.start(upstreamId, tempDir);
                try {
                    loadFromFile(getOutputFilePath(upstreamId), upstreamId, auditEntry);
                    node.depends.put(upstreamId, true);
                    log.info("[{}] Preloaded output for upstream node {} before starting from {}",
                            context.sessionId(), upstreamId, startNodeId);
                } catch (Exception e) {
                    log.info("[{}] Upstream node {} output not found, skipping cache load",
                            context.sessionId(), upstreamId);
                }
                return null;
            }));
        }

        for (Promise<Void> p : preloadPromises) {
            try { p.get(); } catch (Exception ignored) {}
        }

        log.info("[{}] Starting workflow execution from node {}", context.sessionId(), startNodeId);
        executeNode(startNodeId, "root", context, state, single);
    }

    private void initNodeInstance(String nodeId) {
        NodeDefinition nodeDef = graph.getNode(nodeId);
        if (nodeDef == null) {
            throw new IllegalArgumentException("Node definition not found for nodeId: " + nodeId);
        }

        NodeInstance node = new NodeInstance(nodeDef);
        nodes.put(nodeId, node);

        for (String upstreamId : graph.getDirectUpstreamNodes(nodeId)) {
            node.depends.put(upstreamId, false);
        }
    }

    private void initializeDirectories() {
        new File(context.outputDir()).mkdirs();
        new File(context.auditDir()).mkdirs();
        new File(context.tempBaseDir()).mkdirs();
    }

    private void executeNode(String nodeId, String from, ExecutionContext context, ExecutionState state, boolean single) {
        NodeInstance node = nodes.get(nodeId);
        if (node == null) {
            throw new IllegalStateException("Node " + nodeId + " not found");
        }

        if (!node.lock.tryLock()) {
            log.info("[{}] Node {} is already locked, skipping execution", context.sessionId(), nodeId);
            return;
        }

        try {
            if (node.status != NodeStatus.pending) {
                log.info("[{}] Node {} is already {}, skipping execution", context.sessionId(), nodeId, node.status);
                return;
            }

            node.depends.put(from, true);

            String tempDir = createTempDir(context, nodeId);
            AuditEntry auditEntry = audit.start(nodeId, tempDir);

            // Check dependencies
            for (Map.Entry<String, Boolean> dep : node.depends.entrySet()) {
                if (dep.getValue()) continue;

                String dependId = dep.getKey();
                try {
                    loadFromFile(getOutputFilePath(dependId), dependId, auditEntry);
                    node.depends.put(dependId, true);
                } catch (Exception e) {
                    log.info("[{}] Node {} is waiting for dependencies: {}",
                            context.sessionId(), nodeId,
                            node.depends.entrySet().stream()
                                    .filter(e2 -> !e2.getValue())
                                    .map(Map.Entry::getKey)
                                    .toList());
                    return;
                }
            }

            node.status = NodeStatus.running;
            log.info("[{}] Node {} started", context.sessionId(), nodeId);

            Map<String, Object> retryConfig = getRetryConfig(node);
            int maxAttempts = (int) retryConfig.getOrDefault("maxAttempts", DEFAULT_MAX_RETRY_ATTEMPTS);
            String backoff = (String) retryConfig.getOrDefault("backoff", "exponential");
            long baseDelay = (long) retryConfig.getOrDefault("delayMs", (long) DEFAULT_RETRY_DELAY_MS);

            Exception lastError = null;

            for (int attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    executeNodeInternal(nodeId, node.definition, auditEntry, tempDir);
                    node.status = NodeStatus.success;
                    log.info("[{}] Node {} completed successfully", context.sessionId(), nodeId);
                    state.logs().add("✓ " + nodeId + " completed");

                    if (!single) {
                        triggerDownstreamNodes(nodeId, context, state);
                    }
                    return;
                } catch (NodeSkippedException e) {
                    audit.skipped(auditEntry);
                    context.nodeOutputs().put(nodeId, Map.of("__skipped", true));
                    node.status = NodeStatus.skipped;
                    log.info("[{}] Node {} skipped: {}", context.sessionId(), nodeId, e.getMessage());
                    state.logs().add("⊘ " + nodeId + " skipped");
                    return;
                } catch (Exception e) {
                    lastError = e;

                    if (attempt < maxAttempts) {
                        long delay = "exponential".equals(backoff)
                                ? baseDelay * (long) Math.pow(2, attempt - 1)
                                : baseDelay;

                        log.info("[{}] Node {} failed on attempt {}: {}. Retrying in {}ms...",
                                context.sessionId(), nodeId, attempt, e.getMessage(), delay);
                        state.logs().add("✗ " + nodeId + " failed on attempt " + attempt + ". Retrying in " + delay + "ms...");
                        Thread.sleep(delay);
                    }
                }
            }

            // All retries failed
            node.status = NodeStatus.failed;
            log.error("[{}] Node {} failed after {} attempts: {}", context.sessionId(), nodeId, maxAttempts, lastError != null ? lastError.getMessage() : "unknown");
            state.logs().add("✗ " + nodeId + ": " + (lastError != null ? lastError.getMessage() : "unknown"));
            throw new RuntimeException("Node " + nodeId + " failed after " + maxAttempts + " attempts", lastError);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new RuntimeException("Node execution interrupted: " + nodeId, e);
        } finally {
            node.lock.unlock();
        }
    }

    @SuppressWarnings("unchecked")
    private void triggerDownstreamNodes(String nodeId, ExecutionContext context, ExecutionState state) {
        WorkflowDefinition wfDef = context.workflowDef();
        List<String> toTrigger = new ArrayList<>();
        Set<String> skippedNodes = new HashSet<>();

        for (EdgeDefinition edge : wfDef.edges()) {
            if (!edge.from().nodeId().equals(nodeId)) continue;

            if (edge.condition() != null && edge.condition().branches() != null) {
                // Conditional edge - evaluate each branch independently
                Set<String> matchedBranches = new HashSet<>();
                for (EdgeDefinition.Condition.Branch branch : edge.condition().branches()) {
                    try {
                        Object result = conditionEvaluator.evaluate(branch.expression(), context.nodeOutputs());
                        if (Boolean.TRUE.equals(result)) {
                            toTrigger.add(branch.to().nodeId());
                            matchedBranches.add(branch.to().nodeId());
                        }
                    } catch (Exception e) {
                        log.warn("[{}] Condition evaluation failed for branch: {}",
                                context.sessionId(), branch.expression(), e);
                    }
                }

                // Mark unmatched branches as skipped
                for (EdgeDefinition.Condition.Branch branch : edge.condition().branches()) {
                    if (!matchedBranches.contains(branch.to().nodeId())) {
                        skippedNodes.add(branch.to().nodeId());
                    }
                }

                // Handle onNoMatch for the default edge target
                if (matchedBranches.isEmpty()) {
                    String onNoMatch = edge.condition().onNoMatch();
                    if ("default".equals(onNoMatch) && edge.to() != null) {
                        toTrigger.add(edge.to().nodeId());
                    }
                }
            } else if (edge.to() != null) {
                // Unconditional edge
                toTrigger.add(edge.to().nodeId());
            }
        }

        // For skipped branch targets, mark their dependency on the source node as satisfied
        // and propagate this to their downstream nodes
        for (String skippedNodeId : skippedNodes) {
            NodeInstance skippedNode = nodes.get(skippedNodeId);
            if (skippedNode != null) {
                skippedNode.depends.put(nodeId, true);
            }
            // Mark skipped node as a satisfied dependency for all its downstream nodes
            for (String dnId : graph.getDirectDownstreamNodes(skippedNodeId)) {
                NodeInstance dn = nodes.get(dnId);
                if (dn != null) {
                    dn.depends.put(skippedNodeId, true);
                }
            }
        }

        // Remove duplicates and skipped nodes
        toTrigger.removeAll(skippedNodes);

        if (toTrigger.isEmpty()) return;

        Promise<Void>[] promises = toTrigger.stream()
                .distinct()
                .map(dn -> Promise.<Void>async(() -> {
                    executeNode(dn, nodeId, context, state, false);
                    return null;
                }))
                .toArray(Promise[]::new);

        Promise<Object[]> allDownstream = Promise.all(promises);
        try {
            allDownstream.get();
        } catch (Exception ignored) {
            // Individual node failures are handled within executeNode
        }
    }

    private void executeNodeInternal(String nodeId, NodeDefinition nodeDef, AuditEntry auditEntry, String tempDir) throws Exception {
        // 0. Idempotent: check if output file exists
        File outputFile = new File(getOutputFilePath(nodeId));
        if (outputFile.exists()) {
            try {
                loadFromFile(getOutputFilePath(nodeId), nodeId, auditEntry);
                return;
            } catch (Exception ignored) {
                // File doesn't exist or is invalid, continue normal execution
            }
        }

        // 1. Collect and validate inputs
        Map<String, Object> inputs = collectInputs(nodeDef);

        // Inject start inputs for root nodes
        if (graph.getDirectUpstreamNodes(nodeId).isEmpty()) {
            inputs.putAll(startInputs);
        }

        auditEntry = new AuditEntry(
                auditEntry.id(), auditEntry.timestamp(), auditEntry.nodeId(), auditEntry.phase(),
                inputs, auditEntry.outputs(), auditEntry.execution(), auditEntry.retry(), auditEntry.persistedFiles(), auditEntry.error());

        // 2. Create node execution context
        ExecutionContext nodeContext = new ExecutionContext(
                context.workflowDef(), context.workflowDir(), context.outputDir(),
                context.auditDir(), tempDir, context.sessionId(),
                context.nodeOutputs(), context.auditLog(), context.debug(), context.cleanOldFiles());

        // 3. Execute node
        NodeExecutor executor = executors.get(nodeDef.type().toValue());
        if (executor == null) {
            throw new IllegalStateException("No executor registered for node type: " + nodeDef.type().toValue());
        }

        Object rawOutput = executor.execute(nodeDef, inputs, nodeContext);

        // 4. Process output
        Object output = processOutput(nodeDef, rawOutput, tempDir);

        // 5. Persist output
        persistOutput(getOutputFilePath(nodeId), output);

        // 6. Record results
        context.nodeOutputs().put(nodeId, output);
        auditEntry = new AuditEntry(
                auditEntry.id(), auditEntry.timestamp(), auditEntry.nodeId(), Phase.complete,
                auditEntry.inputs(), output, auditEntry.execution(), auditEntry.retry(),
                new AuditEntry.PersistedFiles(getOutputFilePath(nodeId), null), null);
        audit.complete(auditEntry);
    }

    private Map<String, Object> collectInputs(NodeDefinition node) {
        Map<String, Object> inputs = new HashMap<>();
        List<Map<String, Object>> incomingEdges = graph.getIncomingEdges(node.id());
        boolean hasActiveEdge = false;

        for (Map<String, Object> edge : incomingEdges) {
            String from = (String) edge.get("from");

            // Check if source node was skipped
            Object sourceOutput = context.nodeOutputs().get(from);
            if (sourceOutput instanceof Map<?, ?> map && Boolean.TRUE.equals(map.get("__skipped"))) {
                continue;
            }

            inputs.put("config", sourceOutput);
            hasActiveEdge = true;
        }

        if (!hasActiveEdge || inputs.isEmpty()) {
            if (!incomingEdges.isEmpty()) {
                throw new NodeSkippedException(node.id());
            }

            List<String> upstream = graph.getDirectUpstreamNodes(node.id());
            List<String> downstream = graph.getDirectDownstreamNodes(node.id());
            if (upstream.isEmpty() && downstream.isEmpty()) {
                throw new NodeSkippedException(node.id());
            }
        }

        return inputs;
    }

    private Object processOutput(NodeDefinition nodeDef, Object rawOutput, String tempDir) {
        Map<String, Object> config = nodeDef.config();
        if (config == null || !config.containsKey("outputMapping")) {
            return rawOutput;
        }
        // outputMapping processing would go here
        return rawOutput;
    }

    private Map<String, Object> getRetryConfig(NodeInstance node) {
        Map<String, Object> config = node.definition.config();
        if (config == null) return Map.of();
        Object retry = config.get("retry");
        if (retry instanceof Map<?, ?> map) {
            return (Map<String, Object>) map;
        }
        return Map.of();
    }

    private String createTempDir(ExecutionContext ctx, String nodeId) {
        File tempDir = new File(ctx.tempBaseDir(), ctx.sessionId() + "/" + nodeId + "-" + UUID.randomUUID());
        tempDir.mkdirs();
        return tempDir.getAbsolutePath();
    }

    private String getOutputFilePath(String nodeId) {
        return context.outputDir() + "/" + context.sessionId() + "/" + nodeId + ".json";
    }

    private void loadFromFile(String filePath, String nodeId, AuditEntry auditEntry) throws Exception {
        Object output = objectMapper.readValue(new File(filePath), Object.class);
        context.nodeOutputs().put(nodeId, output);
        auditEntry = new AuditEntry(
                auditEntry.id(), auditEntry.timestamp(), auditEntry.nodeId(), auditEntry.phase(),
                auditEntry.inputs(), output, auditEntry.execution(), auditEntry.retry(),
                new AuditEntry.PersistedFiles(filePath, null), null);
        audit.complete(auditEntry);
        log.info("[{}] Node {} output loaded from cache", context.sessionId(), nodeId);
    }

    private void persistOutput(String filePath, Object output) throws Exception {
        File file = new File(filePath);
        file.getParentFile().mkdirs();
        objectMapper.writerWithDefaultPrettyPrinter().writeValue(file, output);
    }
}
