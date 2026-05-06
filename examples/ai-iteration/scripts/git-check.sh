#!/bin/bash
# Git 状态检查 - 检查 git 状态，提交未提交代码，创建新的开发分支

set -e

echo "========================================="
echo "Git 状态检查"
echo "========================================="

# 检查是否在 git 仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
  echo "ERROR: 不在 Git 仓库中"
  exit 1
fi

echo ""
echo "--- 当前分支 ---"
git branch --show-current

echo ""
echo "--- Git 状态 ---"
git status --short

echo ""
echo "--- 未跟踪文件 ---"
UNTRACKED=$(git ls-files --others --exclude-standard)
if [ -n "$UNTRACKED" ]; then
  echo "发现未跟踪文件，提交到暂存区..."
  git add -A
fi

echo ""
echo "--- 未提交的变更 ---"
MODIFIED=$(git diff --name-only HEAD)
if [ -n "$MODIFIED" ]; then
  echo "发现已修改但未提交的文件:"
  echo "$MODIFIED"
  echo ""
  echo "提交现有变更..."
  git commit -m "chore: auto-commit before iteration starts

Co-Authored-By: AI Assistant <noreply@ai-assistant>" || echo "无变更需要提交"
fi

echo ""
echo "--- 创建开发分支 ---"
BRANCH_NAME="feature/ai-iteration-$(date +%Y%m%d-%H%M%S)"
echo "创建分支: $BRANCH_NAME"
git checkout -b "$BRANCH_NAME"

echo ""
echo "========================================="
echo "Git 状态检查完成"
echo "当前分支: $BRANCH_NAME"
echo "========================================="

# 输出结果 JSON
echo "{\"branchName\": \"$BRANCH_NAME\", \"status\": \"success\"}"
