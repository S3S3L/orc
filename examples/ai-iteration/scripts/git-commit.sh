#!/bin/bash
# Git 提交 - 提交本次迭代的代码变更

set -e

echo "========================================="
echo "Git 提交"
echo "========================================="

# 检查是否在 git 仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "ERROR: 不在 Git 仓库中"
  exit 1
fi

echo ""
echo "--- 变更状态 ---"
git status --short

# 添加所有变更
MODIFIED=$(git diff --name-only)
STAGED=$(git diff --cached --name-only)
UNTRACKED=$(git ls-files --others --exclude-standard)

if [ -z "$MODIFIED" ] && [ -z "$STAGED" ] && [ -z "$UNTRACKED" ]; then
  echo "无变更需要提交"
  echo "{\"status\": \"no-changes\"}"
  exit 0
fi

echo ""
echo "添加所有变更..."
git add -A

echo ""
echo "生成提交信息..."

# 获取变更文件列表
FILES_CHANGED=$(git diff --cached --name-only | head -20 | tr '\n' ', ' | sed 's/,$//')

echo ""
echo "提交变更..."
git commit -m "$(cat <<EOF
feat: AI 迭代实现变更

变更文件: $FILES_CHANGED

Co-Authored-By: AI Assistant <noreply@ai-assistant>
EOF
)" || {
  echo "提交失败，可能是没有变更"
  echo "{\"status\": \"no-changes\"}"
  exit 0
}

COMMIT_HASH=$(git rev-parse --short HEAD)
echo ""
echo "========================================="
echo "Git 提交完成"
echo "提交: $COMMIT_HASH"
echo "========================================="

echo "{\"status\": \"success\", \"commitHash\": \"$COMMIT_HASH\"}"
