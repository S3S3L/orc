#!/bin/bash
# 初始化数据 - 生成基础配置
cat << 'EOF'
{
  "baseUrl": "https://api.example.com",
  "apiKey": "test-api-key-12345",
  "timestamp": "2026-04-10T10:00:00Z"
}
EOF
