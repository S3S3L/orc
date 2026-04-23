#!/bin/bash
# 获取配置数据 - 模拟 API 调用
# 从 stdin 读取配置
read config

cat << 'EOF'
{
  "maxRetries": 3,
  "timeout": 30000,
  "featureFlags": ["feature-a", "feature-b", "beta-mode"]
}
EOF
