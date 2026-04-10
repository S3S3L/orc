# 代码审查报告

请根据提供的代码分析结果，生成一份代码审查报告。

## 输入数据

<!-- SECTION: analysis -->

## 要求

1. 分析代码质量问题
2. 列出主要改进建议
3. 给出优先级排序

请以 JSON 格式输出：

```json
{
  "summary": "审查总结",
  "issues": [
    {
      "severity": "high|medium|low",
      "description": "问题描述",
      "suggestion": "改进建议"
    }
  ],
  "recommendations": ["建议 1", "建议 2"]
}
```
