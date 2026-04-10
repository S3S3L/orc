#!/usr/bin/env python3
"""
合并数据 - 接收两个上游节点的输出并合并
"""
import sys
import json

# 从 stdin 读取输入
input_data = json.load(sys.stdin)

# 获取两个输入
user_data = input_data.get('userData', {})
app_config = input_data.get('appConfig', {})

# 合并数据并生成摘要
result = {
    "merged": True,
    "summary": f"User {user_data.get('userName', 'unknown')} with {len(app_config.get('featureFlags', []))} feature flags",
    "itemCount": len(user_data) + len(app_config)
}

print(json.dumps(result))
