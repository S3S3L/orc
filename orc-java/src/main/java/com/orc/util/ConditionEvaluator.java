package com.orc.util;

import com.googlecode.aviator.AviatorEvaluator;
import com.googlecode.aviator.Expression;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class ConditionEvaluator {

    private static final Map<String, Expression> CACHE = new ConcurrentHashMap<>();

    /**
     * Evaluate a condition expression against the given outputs.
     * Expression example: outputs['start'].status == 'success'
     */
    public Object evaluate(String expression, Map<String, Object> outputs) {
        Expression compiled = CACHE.computeIfAbsent(expression, AviatorEvaluator::compile);
        return compiled.execute(Map.of("outputs", outputs));
    }
}
