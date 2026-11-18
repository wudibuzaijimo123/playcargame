#!/usr/bin/env bash
# 日常发布：把 GitHub main 的代码同步到服务器并重启
# 用法：bash /opt/playcargame/deploy/deploy.sh
set -euo pipefail

APP_DIR=/opt/playcargame
SERVICE=playcargame
DOMAIN=game.yhj123.dpdns.org

cd "$APP_DIR"

echo "== 当前提交: $(git rev-parse --short HEAD)"
git fetch --prune origin
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "!! 服务器工作区有本地改动，已跳过 git pull，请先处理："
  git status --short
  exit 1
fi
git pull --ff-only origin main
echo "== 更新到: $(git rev-parse --short HEAD)"

# 无第三方依赖时这步是空操作，保留是为了以后加依赖不出错
if [ -f package-lock.json ]; then
  npm ci --omit=dev --no-audit --no-fund
fi

systemctl restart "$SERVICE"
sleep 1
systemctl is-active --quiet "$SERVICE" || { journalctl -u "$SERVICE" -n 30 --no-pager; exit 1; }

if [ -f "/etc/nginx/conf.d/${DOMAIN}.conf" ] || [ -f "/etc/nginx/conf.d/${DOMAIN}.http.conf" ]; then
  nginx -t && systemctl reload nginx
fi

echo "== 自检"
curl -fsS http://127.0.0.1:3210/api/health && echo
curl -fsS -H "Host: ${DOMAIN}" http://127.0.0.1/api/health && echo
echo "发布完成: $(date '+%F %T')"
