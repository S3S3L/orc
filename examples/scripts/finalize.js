#!/usr/bin/env node

const fs = require('fs');

// 读取 stdin 的 JSON
// 输入格式：{ "processedData": { "processed": true, "result": "...", "metrics": {...} } }
const input = JSON.parse(fs.readFileSync(0, 'utf-8'));

// 支持两种格式：嵌套的或直接的
const data = input.processedData || input;

// 生成最终输出
const output = {
  final: `Node.js finalized: ${data.processed ? data.result : 'No result'}`,
  timestamp: new Date().toISOString(),
  analysis: {
    status: data.processed ? 'success' : 'failed',
    notes: [
      'Pipeline executed successfully',
      `Metrics: ${JSON.stringify(data.metrics || {})}`,
      'Ready for Claude review'
    ]
  }
};

console.log(JSON.stringify(output, null, 2));
