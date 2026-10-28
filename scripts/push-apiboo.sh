#!/bin/zsh
set -euo pipefail
cd /Users/jimmyye/Documents/dimleap/new-api

echo "== 当前账号 =="
gh auth status

echo "== 创建仓库 yee72/ApiBoo（若已存在则跳过） =="
if gh repo view yee72/ApiBoo >/dev/null 2>&1; then
  echo "仓库已存在"
else
  gh repo create ApiBoo --private --description "ApiBoo based on new-api" --disable-wiki
fi

echo "== 配置 remote apiboo =="
if git remote get-url apiboo >/dev/null 2>&1; then
  git remote set-url apiboo git@github.com:yee72/ApiBoo.git
else
  git remote add apiboo git@github.com:yee72/ApiBoo.git
fi

echo "== 推送 main =="
git push -u apiboo main

echo "== 完成 =="
gh repo view yee72/ApiBoo --web
