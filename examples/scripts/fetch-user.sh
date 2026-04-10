#!/bin/bash
# 获取用户数据 - 模拟 API 调用
# 从 stdin 读取配置
read config

cat << 'EOF'
{
  "userId": "user-001",
  "userName": "test-user",
  "email": "test@example.com"
}
EOF
