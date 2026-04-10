#!/usr/bin/env python3
import json
import sys
import time

# 读取 stdin 的 JSON
# 输入格式：{ "data": { "message": "...", "count": N } }
data = json.load(sys.stdin)

# 处理数据
inner_data = data.get('data', data)  # 支持两种格式
output = {
    "processed": True,
    "result": f"Python processed: {inner_data.get('message', '')} (count: {inner_data.get('count', 0)})",
    "metrics": {
        "processingTime": 0.123,
        "dataSize": len(json.dumps(inner_data))
    }
}

print(json.dumps(output))
