package com.orc.core;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.model.EdgeDefinition;
import com.orc.model.NodeDefinition;
import com.orc.model.WorkflowDefinition;
import com.orc.model.WorkflowDefinition.SchemaEntry;
import org.jgrapht.Graph;
import org.jgrapht.alg.connectivity.ConnectivityInspector;
import org.jgrapht.alg.cycle.CycleDetector;
import org.jgrapht.graph.DefaultDirectedGraph;
import org.jgrapht.graph.DefaultEdge;
import org.jgrapht.traverse.TopologicalOrderIterator;
import org.jgrapht.Graphs;

import java.io.File;
import java.util.*;
import java.util.stream.Collectors;

public class WorkflowGraph {

    private final Graph<String, DefaultEdge> graph;
    private final Map<String, NodeDefinition> nodes = new HashMap<>();
    private final String graphDir;

    public WorkflowGraph(WorkflowDefinition workflowDef, String graphDir) {
        this.graph = new DefaultDirectedGraph<>(DefaultEdge.class);
        this.graphDir = graphDir;

        loadExternalSchemas(workflowDef);
        build(workflowDef);
        validateDAG();
        validateSchemaConnections(workflowDef.edges());
    }

    private void loadExternalSchemas(WorkflowDefinition workflowDef) {
        if (workflowDef.schemaBaseDir() == null) return;

        for (String dir : workflowDef.schemaBaseDir()) {
            File schemaDir = new File(graphDir, dir);
            if (!schemaDir.isDirectory()) continue;

            File[] files = schemaDir.listFiles((d, name) -> name.endsWith(".json"));
            if (files == null) continue;

            for (File file : files) {
                try {
                    String fileNameWithoutExt = file.getName().replace(".json", "");
                    JsonNode content = new ObjectMapper().readTree(file);
                    if (workflowDef.schemas() == null) continue;

                    SchemaEntry entry = workflowDef.schemas().get(fileNameWithoutExt);
                    if (entry != null && entry.content() == null) {
                        // Schema content loaded via file path
                    }
                } catch (Exception e) {
                    throw new RuntimeException("Failed to load schema file " + file.getName() + ": " + e.getMessage(), e);
                }
            }
        }

        ObjectMapper objectMapper = new ObjectMapper();
        if (workflowDef.schemas() != null) {
            for (Map.Entry<String, SchemaEntry> entry : workflowDef.schemas().entrySet()) {
                SchemaEntry schema = entry.getValue();
                if (schema.file() != null && schema.content() == null) {
                    try {
                        File schemaFile = new File(graphDir, schema.file());
                        schema = new SchemaEntry(schema.file(),
                                objectMapper.readTree(schemaFile));
                        // Replace in a mutable way - WorkflowDefinition is a record so we can't mutate
                        // Instead, we'll handle this at the WorkflowDefinition level
                    } catch (Exception e) {
                        throw new RuntimeException("Failed to load schema file " + schema.file() + ": " + e.getMessage(), e);
                    }
                }
            }
        }
    }

    private void build(WorkflowDefinition workflowDef) {
        // 1. Add nodes
        for (NodeDefinition node : workflowDef.nodes()) {
            if (!graph.containsVertex(node.id())) {
                graph.addVertex(node.id());
            }
            nodes.put(node.id(), node);
        }

        // 2. Add edges
        for (EdgeDefinition edge : workflowDef.edges()) {
            if (!graph.containsVertex(edge.from().nodeId())) {
                throw new IllegalArgumentException("Edge " + edge.id() + ": source node " + edge.from().nodeId() + " not found");
            }

            if (edge.to() != null) {
                if (!graph.containsVertex(edge.to().nodeId())) {
                    throw new IllegalArgumentException("Edge " + edge.id() + ": target node " + edge.to().nodeId() + " not found");
                }
                graph.addEdge(edge.from().nodeId(), edge.to().nodeId());
            }

            if (edge.condition() != null && edge.condition().branches() != null) {
                for (EdgeDefinition.Condition.Branch branch : edge.condition().branches()) {
                    if (!graph.containsVertex(branch.to().nodeId())) {
                        throw new IllegalArgumentException("Edge " + edge.id() + ": branch target " + branch.to().nodeId() + " not found");
                    }
                    graph.addEdge(edge.from().nodeId(), branch.to().nodeId());
                }
            }
        }
    }

    private void validateDAG() {
        CycleDetector<String, DefaultEdge> detector = new CycleDetector<>(graph);
        if (detector.detectCycles()) {
            throw new RuntimeException("Graph contains cycles");
        }
    }

    private void validateSchemaConnections(List<EdgeDefinition> edges) {
        Map<String, List<EdgeDefinition.ToNode>> edgesByTarget = new HashMap<>();

        for (EdgeDefinition edge : edges) {
            if (edge.to() != null) {
                edgesByTarget.computeIfAbsent(edge.to().nodeId(), k -> new ArrayList<>())
                        .add(edge.to());
            }
            if (edge.condition() != null && edge.condition().branches() != null) {
                for (EdgeDefinition.Condition.Branch branch : edge.condition().branches()) {
                    edgesByTarget.computeIfAbsent(branch.to().nodeId(), k -> new ArrayList<>())
                            .add(branch.to());
                }
            }
        }

        for (Map.Entry<String, List<EdgeDefinition.ToNode>> entry : edgesByTarget.entrySet()) {
            NodeDefinition node = nodes.get(entry.getKey());
            if (node == null) continue;

            Set<String> providedInputs = entry.getValue().stream()
                    .map(EdgeDefinition.ToNode::input)
                    .collect(Collectors.toSet());

            for (String inputName : node.inputs().keySet()) {
                if (!providedInputs.contains(inputName)) {
                    throw new IllegalArgumentException(
                            "Node " + entry.getKey() + ": required input '" + inputName + "' is not provided by any edge");
                }
            }
        }
    }

    public List<String> getExecutionOrder() {
        List<String> result = new ArrayList<>();
        TopologicalOrderIterator<String, DefaultEdge> iter = new TopologicalOrderIterator<>(graph);
        iter.forEachRemaining(result::add);
        return result;
    }

    public List<String> getRootNodes() {
        return graph.vertexSet().stream()
                .filter(nid -> graph.inDegreeOf(nid) == 0 && graph.outDegreeOf(nid) > 0)
                .toList();
    }

    public List<String> getDirectUpstreamNodes(String nodeId) {
        return Graphs.predecessorListOf(graph, nodeId);
    }

    public List<String> getDirectDownstreamNodes(String nodeId) {
        return Graphs.successorListOf(graph, nodeId);
    }

    public List<String> getAllDownstreamNodes(String nodeId) {
        Set<String> visited = new LinkedHashSet<>();
        Deque<String> stack = new ArrayDeque<>();
        stack.push(nodeId);

        while (!stack.isEmpty()) {
            String current = stack.pop();
            if (visited.add(current)) {
                stack.addAll(getDirectDownstreamNodes(current));
            }
        }
        visited.remove(nodeId);
        return new ArrayList<>(visited);
    }

    public List<String> getAllValidNodes() {
        return graph.vertexSet().stream()
                .filter(nid -> graph.inDegreeOf(nid) > 0 || graph.outDegreeOf(nid) > 0)
                .toList();
    }

    public NodeDefinition getNode(String nodeId) {
        return nodes.get(nodeId);
    }

    public List<NodeDefinition> getAllNodes() {
        return new ArrayList<>(nodes.values());
    }

    public int size() {
        return graph.vertexSet().size();
    }

    public Graph<String, DefaultEdge> getGraph() {
        return graph;
    }

    public List<Map<String, Object>> getIncomingEdges(String nodeId) {
        List<Map<String, Object>> result = new ArrayList<>();
        Set<DefaultEdge> incoming = graph.incomingEdgesOf(nodeId);
        for (DefaultEdge edge : incoming) {
            Map<String, Object> attrs = new HashMap<>();
            attrs.put("from", graph.getEdgeSource(edge));
            attrs.put("to", graph.getEdgeTarget(edge));
            result.add(attrs);
        }
        return result;
    }

    public boolean hasPath(String from, String to) {
        ConnectivityInspector<String, DefaultEdge> inspector = new ConnectivityInspector<>(graph);
        return inspector.pathExists(from, to);
    }
}
