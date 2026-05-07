package com.orc.model;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.*;

@DisplayName("模型 - JSON 序列化与反序列化")
class ModelSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Nested
    @DisplayName("NodeType 序列化")
    class NodeTypeSerialization {

        @Test
        @DisplayName("bash 应该序列化为 'bash'")
        void shouldSerializeBash() throws Exception {
            assertThat(objectMapper.writeValueAsString(NodeType.bash)).isEqualTo("\"bash\"");
        }

        @Test
        @DisplayName("claude_code 应该序列化为 'claude-code'")
        void shouldSerializeClaudeCode() throws Exception {
            assertThat(objectMapper.writeValueAsString(NodeType.claude_code)).isEqualTo("\"claude-code\"");
        }

        @Test
        @DisplayName("'claude-code' 应该反序列化为 claude_code")
        void shouldDeserializeClaudeCode() throws Exception {
            assertThat(objectMapper.readValue("\"claude-code\"", NodeType.class)).isEqualTo(NodeType.claude_code);
        }

        @Test
        @DisplayName("所有类型应该双向序列化")
        void shouldRoundTripAllTypes() throws Exception {
            for (NodeType type : NodeType.values()) {
                String json = objectMapper.writeValueAsString(type);
                NodeType deserialized = objectMapper.readValue(json, NodeType.class);
                assertThat(deserialized).isEqualTo(type);
            }
        }
    }

    @Nested
    @DisplayName("NodeDefinition 序列化")
    class NodeDefinitionSerialization {

        @Test
        @DisplayName("应该反序列化完整的节点定义")
        void shouldDeserializeNodeDefinition() throws Exception {
            String json = """
                    {
                      "id": "test-node",
                      "type": "bash",
                      "name": "Test Node",
                      "inputs": {},
                      "output": {"schema": {"type": "object"}},
                      "config": {"script": "test.sh", "argsPassing": {"type": "stdin"}}
                    }
                    """;

            NodeDefinition node = objectMapper.readValue(json, NodeDefinition.class);

            assertThat(node.id()).isEqualTo("test-node");
            assertThat(node.type()).isEqualTo(NodeType.bash);
            assertThat(node.name()).isEqualTo("Test Node");
            assertThat(node.config()).containsEntry("script", "test.sh");
        }

        @Test
        @DisplayName("应该反序列化 claude-code 节点")
        void shouldDeserializeClaudeCodeNode() throws Exception {
            String json = """
                    {
                      "id": "ai-node",
                      "type": "claude-code",
                      "name": "AI Node",
                      "inputs": {},
                      "output": {"schema": {}},
                      "config": {"prompt": {"markdown": "prompt.md"}}
                    }
                    """;

            NodeDefinition node = objectMapper.readValue(json, NodeDefinition.class);

            assertThat(node.type()).isEqualTo(NodeType.claude_code);
            assertThat(node.id()).isEqualTo("ai-node");
        }
    }

    @Nested
    @DisplayName("EdgeDefinition 序列化")
    class EdgeDefinitionSerialization {

        @Test
        @DisplayName("应该反序列化边定义")
        void shouldDeserializeEdgeDefinition() throws Exception {
            String json = """
                    {
                      "id": "edge-1",
                      "from": {"nodeId": "start"},
                      "to": {"nodeId": "process", "input": "config"}
                    }
                    """;

            EdgeDefinition edge = objectMapper.readValue(json, EdgeDefinition.class);

            assertThat(edge.id()).isEqualTo("edge-1");
            assertThat(edge.from().nodeId()).isEqualTo("start");
            assertThat(edge.to().nodeId()).isEqualTo("process");
            assertThat(edge.to().input()).isEqualTo("config");
        }

        @Test
        @DisplayName("应该反序列化条件边定义")
        void shouldDeserializeConditionalEdge() throws Exception {
            String json = """
                    {
                      "id": "edge-branch",
                      "from": {"nodeId": "start"},
                      "to": {"nodeId": "default", "input": "config"},
                      "condition": {
                        "branches": [
                          {"expression": "outputs.a.status == 'success'", "to": {"nodeId": "success", "input": "config"}},
                          {"expression": "outputs.a.status == 'failure'", "to": {"nodeId": "failure", "input": "config"}}
                        ],
                        "onNoMatch": "skip"
                      }
                    }
                    """;

            EdgeDefinition edge = objectMapper.readValue(json, EdgeDefinition.class);

            assertThat(edge.condition()).isNotNull();
            assertThat(edge.condition().branches()).hasSize(2);
            assertThat(edge.condition().branches().get(0).to().nodeId()).isEqualTo("success");
            assertThat(edge.condition().onNoMatch()).isEqualTo("skip");
        }
    }

    @Nested
    @DisplayName("WorkflowDefinition 序列化")
    class WorkflowDefinitionSerialization {

        @Test
        @DisplayName("应该反序列化完整的工作流")
        void shouldDeserializeWorkflow() throws Exception {
            String json = """
                    {
                      "version": "1.0",
                      "name": "test-workflow",
                      "description": "Test workflow",
                      "nodes": [
                        {"id": "a", "type": "bash", "name": "A", "inputs": {}, "output": {"schema": {}}, "config": {"script": "a.sh", "argsPassing": {"type": "stdin"}}}
                      ],
                      "edges": [
                        {"id": "e1", "from": {"nodeId": "a"}, "to": {"nodeId": "b", "input": "config"}}
                      ]
                    }
                    """;

            WorkflowDefinition workflow = objectMapper.readValue(json, WorkflowDefinition.class);

            assertThat(workflow.version()).isEqualTo("1.0");
            assertThat(workflow.name()).isEqualTo("test-workflow");
            assertThat(workflow.nodes()).hasSize(1);
            assertThat(workflow.nodes().get(0).id()).isEqualTo("a");
            assertThat(workflow.edges()).hasSize(1);
        }

        @Test
        @DisplayName("应该序列化工作流定义")
        void shouldSerializeWorkflow() throws Exception {
            WorkflowDefinition workflow = new WorkflowDefinition(
                    "1.0", "simple", "Simple workflow", null, null,
                    List.of(new NodeDefinition("a", NodeType.bash, "A", null, null, Map.of(), Map.of())),
                    List.of());

            String json = objectMapper.writeValueAsString(workflow);

            assertThat(json).contains("\"version\":\"1.0\"");
            assertThat(json).contains("\"name\":\"simple\"");
        }
    }

    @Nested
    @DisplayName("ExecutionState 序列化")
    class ExecutionStateSerialization {

        @Test
        @DisplayName("running 状态应该正确序列化")
        void shouldSerializeRunningState() throws Exception {
            ExecutionState state = ExecutionState.running("session-123");

            assertThat(state.status()).isEqualTo("running");
            assertThat(state.logs()).contains("Workflow started: session-123");
            assertThat(state.startTime()).isGreaterThan(0);
            assertThat(state.complete()).isFalse();
        }
    }
}
