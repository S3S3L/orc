package com.orc.core;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orc.model.EdgeDefinition;
import com.orc.model.NodeDefinition;
import com.orc.model.WorkflowDefinition;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

@DisplayName("WorkflowGraph - DAG 构建与查询")
class WorkflowGraphTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private WorkflowDefinition workflow;

    @BeforeEach
    void setUp() throws Exception {
        workflow = objectMapper.readValue(
                getClass().getClassLoader().getResourceAsStream("test-workflow.json"),
                WorkflowDefinition.class);
    }

    @Nested
    @DisplayName("节点构建")
    class NodeBuilding {

        @Test
        @DisplayName("应该加载所有节点")
        void shouldLoadAllNodes() {
            WorkflowGraph graph = new WorkflowGraph(workflow, "test");

            assertThat(graph.size()).isEqualTo(4);
            assertThat(graph.getAllNodes()).hasSize(4);
            assertThat(graph.getNode("start")).isNotNull();
            assertThat(graph.getNode("start").type()).isEqualTo(com.orc.model.NodeType.bash);
        }

        @Test
        @DisplayName("应该识别正确的节点类型")
        void shouldIdentifyNodeTypes() {
            WorkflowGraph graph = new WorkflowGraph(workflow, "test");

            for (NodeDefinition node : graph.getAllNodes()) {
                assertThat(node.type()).isIn(
                        com.orc.model.NodeType.bash,
                        com.orc.model.NodeType.python,
                        com.orc.model.NodeType.node,
                        com.orc.model.NodeType.claude_code,
                        com.orc.model.NodeType.loop);
            }
        }
    }

    @Nested
    @DisplayName("边构建")
    class EdgeBuilding {

        @Test
        @DisplayName("应该添加默认 to 边")
        void shouldAddDefaultToEdge() {
            WorkflowGraph graph = new WorkflowGraph(workflow, "test");

            List<String> downstream = graph.getDirectDownstreamNodes("start");
            assertThat(downstream).contains("process");
        }

        @Test
        @DisplayName("应该添加 condition.branches 边")
        void shouldAddConditionBranchEdges() {
            WorkflowGraph graph = new WorkflowGraph(workflow, "test");

            List<String> downstream = graph.getDirectDownstreamNodes("start");
            assertThat(downstream).contains("success-path", "failure-path");
        }
    }

    @Nested
    @DisplayName("DAG 验证")
    class DAGValidation {

        @Test
        @DisplayName("应该拒绝循环图")
        void shouldRejectCyclicGraph() {
            WorkflowDefinition cyclic = new WorkflowDefinition(
                    "1.0", "cyclic", null, null, null,
                    List.of(
                            new NodeDefinition("a", com.orc.model.NodeType.bash, "A", null, null, Map.of(), Map.of()),
                            new NodeDefinition("b", com.orc.model.NodeType.bash, "B", null, null, Map.of(), Map.of())
                    ),
                    List.of(
                            new EdgeDefinition("e1", new EdgeDefinition.FromNode("a"), new EdgeDefinition.ToNode("b", "input"), null),
                            new EdgeDefinition("e2", new EdgeDefinition.FromNode("b"), new EdgeDefinition.ToNode("a", "input"), null)
                    ));

            assertThatThrownBy(() -> new WorkflowGraph(cyclic, "test"))
                    .isInstanceOf(RuntimeException.class)
                    .hasMessageContaining("cycle");
        }

        @Test
        @DisplayName("应该接受有效的线性图")
        void shouldAcceptValidLinearGraph() {
            WorkflowDefinition linear = new WorkflowDefinition(
                    "1.0", "linear", null, null, null,
                    List.of(
                            new NodeDefinition("a", com.orc.model.NodeType.bash, "A", null, null, Map.of(), Map.of()),
                            new NodeDefinition("b", com.orc.model.NodeType.bash, "B", null, null, Map.of(), Map.of())
                    ),
                    List.of(
                            new EdgeDefinition("e1", new EdgeDefinition.FromNode("a"), new EdgeDefinition.ToNode("b", "input"), null)
                    ));

            assertThatCode(() -> new WorkflowGraph(linear, "test")).doesNotThrowAnyException();
        }
    }

    @Nested
    @DisplayName("拓扑排序")
    class TopologicalSort {

        @Test
        @DisplayName("应该返回正确的执行顺序")
        void shouldReturnCorrectExecutionOrder() {
            WorkflowGraph graph = new WorkflowGraph(workflow, "test");
            List<String> order = graph.getExecutionOrder();

            assertThat(order).hasSize(4);
            // start has no incoming edges, must come first
            assertThat(order.indexOf("start")).isLessThan(order.indexOf("process"));
            assertThat(order.indexOf("start")).isLessThan(order.indexOf("success-path"));
            assertThat(order.indexOf("start")).isLessThan(order.indexOf("failure-path"));
        }
    }

    @Nested
    @DisplayName("根节点查询")
    class RootNodes {

        @Test
        @DisplayName("应该返回没有入度的节点")
        void shouldReturnNodesWithoutIncomingEdges() {
            WorkflowGraph graph = new WorkflowGraph(workflow, "test");
            List<String> roots = graph.getRootNodes();

            assertThat(roots).contains("start");
        }
    }

    @Nested
    @DisplayName("上下游节点查询")
    class UpstreamDownstreamQuery {

        @Test
        @DisplayName("getDirectUpstreamNodes 应该返回直接上游节点")
        void shouldReturnDirectUpstreamNodes() {
            WorkflowGraph graph = new WorkflowGraph(workflow, "test");
            List<String> upstream = graph.getDirectUpstreamNodes("process");

            assertThat(upstream).contains("start");
        }

        @Test
        @DisplayName("getDirectDownstreamNodes 应该返回直接下游节点")
        void shouldReturnDirectDownstreamNodes() {
            WorkflowGraph graph = new WorkflowGraph(workflow, "test");
            List<String> downstream = graph.getDirectDownstreamNodes("start");

            assertThat(downstream).contains("process", "success-path", "failure-path");
        }

        @Test
        @DisplayName("getAllDownstreamNodes 应该返回所有下游节点（递归）")
        void shouldReturnAllDownstreamNodes() {
            // Build a linear graph: a -> b -> c
            WorkflowDefinition linear = new WorkflowDefinition(
                    "1.0", "linear", null, null, null,
                    List.of(
                            new NodeDefinition("a", com.orc.model.NodeType.bash, "A", null, null, Map.of(), Map.of()),
                            new NodeDefinition("b", com.orc.model.NodeType.bash, "B", null, null, Map.of(), Map.of()),
                            new NodeDefinition("c", com.orc.model.NodeType.bash, "C", null, null, Map.of(), Map.of())
                    ),
                    List.of(
                            new EdgeDefinition("e1", new EdgeDefinition.FromNode("a"), new EdgeDefinition.ToNode("b", "input"), null),
                            new EdgeDefinition("e2", new EdgeDefinition.FromNode("b"), new EdgeDefinition.ToNode("c", "input"), null)
                    ));

            WorkflowGraph graph = new WorkflowGraph(linear, "test");
            List<String> allDownstream = graph.getAllDownstreamNodes("a");

            assertThat(allDownstream).containsExactlyInAnyOrder("b", "c");
        }

        @Test
        @DisplayName("getAllValidNodes 应该返回有连接的有效节点")
        void shouldReturnValidNodes() {
            WorkflowGraph graph = new WorkflowGraph(workflow, "test");
            List<String> validNodes = graph.getAllValidNodes();

            assertThat(validNodes).hasSize(4);
        }

        @Test
        @DisplayName("getIncomingEdges 应该返回入边列表")
        void shouldReturnIncomingEdges() {
            WorkflowGraph graph = new WorkflowGraph(workflow, "test");
            List<Map<String, Object>> incoming = graph.getIncomingEdges("process");

            assertThat(incoming).isNotEmpty();
            assertThat(incoming.get(0)).containsKey("from");
        }
    }

    @Nested
    @DisplayName("错误处理")
    class ErrorHandling {

        @Test
        @DisplayName("当边的源节点不存在时应抛出异常")
        void shouldThrowWhenSourceNodeNotFound() {
            WorkflowDefinition invalid = new WorkflowDefinition(
                    "1.0", "invalid", null, null, null,
                    List.of(new NodeDefinition("a", com.orc.model.NodeType.bash, "A", null, null, Map.of(), Map.of())),
                    List.of(new EdgeDefinition("e1", new EdgeDefinition.FromNode("nonexistent"), new EdgeDefinition.ToNode("a", "input"), null)));

            assertThatThrownBy(() -> new WorkflowGraph(invalid, "test"))
                    .hasMessageContaining("source node");
        }

        @Test
        @DisplayName("当边的目标节点不存在时应抛出异常")
        void shouldThrowWhenTargetNodeNotFound() {
            WorkflowDefinition invalid = new WorkflowDefinition(
                    "1.0", "invalid", null, null, null,
                    List.of(new NodeDefinition("a", com.orc.model.NodeType.bash, "A", null, null, Map.of(), Map.of())),
                    List.of(new EdgeDefinition("e1", new EdgeDefinition.FromNode("a"), new EdgeDefinition.ToNode("nonexistent", "input"), null)));

            assertThatThrownBy(() -> new WorkflowGraph(invalid, "test"))
                    .hasMessageContaining("target node");
        }

        @Test
        @DisplayName("当分支目标节点不存在时应抛出异常")
        void shouldThrowWhenBranchTargetNotFound() {
            WorkflowDefinition invalid = new WorkflowDefinition(
                    "1.0", "invalid", null, null, null,
                    List.of(
                            new NodeDefinition("a", com.orc.model.NodeType.bash, "A", null, null, Map.of(), Map.of()),
                            new NodeDefinition("b", com.orc.model.NodeType.bash, "B", null, null, Map.of(), Map.of())
                    ),
                    List.of(new EdgeDefinition("e1",
                            new EdgeDefinition.FromNode("a"),
                            null,
                            new EdgeDefinition.Condition(
                                    List.of(new EdgeDefinition.Condition.Branch(
                                            "true",
                                            new EdgeDefinition.ToNode("nonexistent", "input"))),
                                    "skip"))));

            assertThatThrownBy(() -> new WorkflowGraph(invalid, "test"))
                    .hasMessageContaining("branch target");
        }
    }
}
