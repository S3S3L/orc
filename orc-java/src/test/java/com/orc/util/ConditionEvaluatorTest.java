package com.orc.util;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.*;

@DisplayName("ConditionEvaluator - Aviator 条件表达式求值")
class ConditionEvaluatorTest {

    private ConditionEvaluator evaluator;

    @BeforeEach
    void setUp() {
        evaluator = new ConditionEvaluator();
    }

    @Nested
    @DisplayName("基本比较运算")
    class BasicComparison {

        @Test
        @DisplayName("等于比较应该返回 true")
        void equalityShouldReturnTrue() {
            Map<String, Object> outputs = Map.of(
                    "start", Map.of("status", "success"));

            // Aviator uses dot notation: outputs.start.status
            Object result = evaluator.evaluate("outputs.start.status == 'success'", outputs);
            assertThat(result).isEqualTo(true);
        }

        @Test
        @DisplayName("等于比较应该返回 false")
        void equalityShouldReturnFalse() {
            Map<String, Object> outputs = Map.of(
                    "start", Map.of("status", "failure"));

            Object result = evaluator.evaluate("outputs.start.status == 'success'", outputs);
            assertThat(result).isEqualTo(false);
        }

        @Test
        @DisplayName("不等于比较应该返回 true")
        void inequalityShouldReturnTrue() {
            Map<String, Object> outputs = Map.of(
                    "start", Map.of("status", "failure"));

            Object result = evaluator.evaluate("outputs.start.status != 'success'", outputs);
            assertThat(result).isEqualTo(true);
        }
    }

    @Nested
    @DisplayName("嵌套字段访问")
    class NestedFieldAccess {

        @Test
        @DisplayName("应该访问嵌套字段")
        void shouldAccessNestedField() {
            Map<String, Object> outputs = Map.of(
                    "analyze", Map.of("result", Map.of("score", 95)));

            Object result = evaluator.evaluate("outputs.analyze.result.score == 95", outputs);
            assertThat(result).isEqualTo(true);
        }

        @Test
        @DisplayName("应该支持多级嵌套")
        void shouldSupportMultiLevelNesting() {
            Map<String, Object> outputs = Map.of(
                    "deep", Map.of("a", Map.of("b", Map.of("c", "value"))));

            Object result = evaluator.evaluate("outputs.deep.a.b.c == 'value'", outputs);
            assertThat(result).isEqualTo(true);
        }
    }

    @Nested
    @DisplayName("逻辑运算")
    class LogicalOperations {

        @Test
        @DisplayName("AND 运算应该返回正确结果")
        void andOperation() {
            Map<String, Object> outputs = Map.of(
                    "a", Map.of("status", "success"),
                    "b", Map.of("status", "success"));

            Object result = evaluator.evaluate(
                    "outputs.a.status == 'success' && outputs.b.status == 'success'",
                    outputs);
            assertThat(result).isEqualTo(true);
        }

        @Test
        @DisplayName("OR 运算应该返回正确结果")
        void orOperation() {
            Map<String, Object> outputs = Map.of(
                    "a", Map.of("status", "success"),
                    "b", Map.of("status", "failure"));

            Object result = evaluator.evaluate(
                    "outputs.a.status == 'success' || outputs.b.status == 'success'",
                    outputs);
            assertThat(result).isEqualTo(true);
        }

        @Test
        @DisplayName("NOT 运算应该返回正确结果")
        void notOperation() {
            Map<String, Object> outputs = Map.of(
                    "a", Map.of("status", "failure"));

            Object result = evaluator.evaluate(
                    "!(outputs.a.status == 'success')", outputs);
            assertThat(result).isEqualTo(true);
        }
    }

    @Nested
    @DisplayName("循环验证场景")
    class LoopValidation {

        @Test
        @DisplayName("应该验证循环成功条件")
        void shouldValidateLoopSuccess() {
            Map<String, Object> outputs = Map.of(
                    "loopCheck", Map.of("status", "success"),
                    "iteration1", Map.of("status", "success"));

            Object result = evaluator.evaluate(
                    "outputs.loopCheck.status == 'success'", outputs);
            assertThat(result).isEqualTo(true);
        }

        @Test
        @DisplayName("应该验证循环失败条件")
        void shouldValidateLoopFailure() {
            Map<String, Object> outputs = Map.of(
                    "loopCheck", Map.of("status", "failure"));

            Object result = evaluator.evaluate(
                    "outputs.loopCheck.status == 'success'", outputs);
            assertThat(result).isEqualTo(false);
        }
    }

    @Nested
    @DisplayName("错误处理")
    class ErrorHandling {

        @Test
        @DisplayName("表达式语法错误应该抛出异常")
        void shouldThrowOnInvalidExpression() {
            Map<String, Object> outputs = Map.of("a", Map.of("status", "success"));

            assertThatThrownBy(() -> evaluator.evaluate("outputs.a.status === 'success'", outputs))
                    .isInstanceOf(RuntimeException.class);
        }
    }

    @Nested
    @DisplayName("缓存行为")
    class CachingBehavior {

        @Test
        @DisplayName("相同表达式应该被缓存并复用")
        void shouldCacheExpressions() {
            Map<String, Object> outputs = Map.of("x", Map.of("v", 10));

            // First evaluation
            Object result1 = evaluator.evaluate("outputs.x.v == 10", outputs);
            assertThat(result1).isEqualTo(true);

            // Second evaluation should use cached expression
            Object result2 = evaluator.evaluate("outputs.x.v == 10", outputs);
            assertThat(result2).isEqualTo(true);
        }
    }
}
