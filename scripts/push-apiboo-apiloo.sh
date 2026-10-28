#!/bin/zsh
set -euo pipefail
cd /Users/jimmyye/Documents/dimleap/new-api

echo "== 解锁登录钥匙串（若弹出密码框请输入 Mac 登录密码） =="
security unlock-keychain ~/Library/Keychains/login.keychain-db || true

echo ""
echo "== 检查 gh 登录 =="
if ! gh auth status; then
  echo ""
  echo "gh 未登录或钥匙串不可用。请先执行："
  echo "  gh auth login"
  echo "然后再跑本脚本。"
  exit 1
fi

echo ""
echo "== 拉取 https://github.com/yee72/new-api （origin）最新 =="
git fetch origin

ensure_repo() {
  local name="$1"
  local desc="$2"
  if gh repo view "yee72/${name}" >/dev/null 2>&1; then
    echo "仓库已存在: yee72/${name}"
  else
    echo "创建仓库: yee72/${name}"
    gh repo create "${name}" --private --description "${desc}" --disable-wiki
  fi
}

ensure_remote() {
  local remote="$1"
  local name="$2"
  if git remote get-url "${remote}" >/dev/null 2>&1; then
    git remote set-url "${remote}" "git@github.com:yee72/${name}.git"
  else
    git remote add "${remote}" "git@github.com:yee72/${name}.git"
  fi
}

echo ""
echo "== ApiBoo ← https://github.com/yee72/new-api （origin/main） =="
ensure_repo "ApiBoo" "Fork snapshot from yee72/new-api"
ensure_remote "apiboo" "ApiBoo"
# 远程跟踪分支作源时须写全 ref，否则 git 无法解析 destination
git push -u apiboo refs/remotes/origin/main:refs/heads/main
echo "完成: https://github.com/yee72/ApiBoo"

echo ""
echo "== ApiLoo ← 本地当前代码（HEAD=$(git rev-parse --short HEAD)） =="
ensure_repo "ApiLoo" "Local customized new-api"
ensure_remote "apiloo" "ApiLoo"
git push -u apiloo HEAD:refs/heads/main
echo "完成: https://github.com/yee72/ApiLoo"

echo ""
echo "== 全部完成 =="
echo "ApiBoo <- https://github.com/yee72/new-api (origin/main)"
echo "ApiLoo <- local HEAD ($(git rev-parse --short HEAD))"
gh repo view yee72/ApiBoo --json url -q .url
gh repo view yee72/ApiLoo --json url -q .url
