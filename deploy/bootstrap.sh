#!/usr/bin/env bash
# 一次性初始化：把本机变成 PlayCarGame 的唯一生产环境（前端 + 后端同机）
# 用法：bash /opt/playcargame/deploy/bootstrap.sh
set -euo pipefail

APP_DIR=/opt/playcargame
REPO=https://github.com/wudibuzaijimo123/playcargame.git
DOMAIN=game.yhj123.dpdns.org
NGINX_CONF=/etc/nginx/conf.d/${DOMAIN}.conf
WEBROOT=/var/www/letsencrypt
SERVICE=playcargame

log() { printf '\n\033[1;36m== %s\033[0m\n' "$*"; }

[ "$(id -u)" = "0" ] || { echo "请用 root 运行"; exit 1; }

log "1/7 准备 certbot webroot"
mkdir -p "$WEBROOT"

log "2/7 迁移旧目录并拉取仓库"
if [ -d "$APP_DIR/.git" ]; then
  echo "已是 git 仓库，执行更新"
  git -C "$APP_DIR" pull --ff-only origin main
else
  STAMP=$(date +%Y%m%d-%H%M%S)
  if [ -d "$APP_DIR" ]; then
    cp -a "$APP_DIR/data" "/tmp/playcargame-data-$STAMP" 2>/dev/null || true
    mv "$APP_DIR" "${APP_DIR}.bak-${STAMP}"
    echo "旧目录已备份到 ${APP_DIR}.bak-${STAMP}"
  fi
  git clone "$REPO" "$APP_DIR"
  if [ -d "/tmp/playcargame-data-$STAMP" ]; then
    mkdir -p "$APP_DIR/data"
    cp -a "/tmp/playcargame-data-$STAMP/." "$APP_DIR/data/"
    echo "已恢复 data/（排行榜 / 房间状态）"
  fi
fi
mkdir -p "$APP_DIR/data" "$APP_DIR/logs"

log "3/7 安装 systemd 服务"
install -m 644 "$APP_DIR/deploy/systemd/${SERVICE}.service" "/etc/systemd/system/${SERVICE}.service"
systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
sleep 1
systemctl is-active --quiet "$SERVICE" && echo "服务运行中 (127.0.0.1:3210)"

log "4/7 安装 80 端口站点（先用 HTTP 打通）"
install -m 644 "$APP_DIR/deploy/nginx/${DOMAIN}.http.conf" "$NGINX_CONF"
nginx -t
systemctl reload nginx

log "5/7 签发 ${DOMAIN} 证书（HTTP-01，需要 DNS 已指向本机）"
if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  echo "证书已存在，跳过签发"
else
  certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring \
    || { echo "签发失败：请确认 ${DOMAIN} 的 A 记录已指向本机 47.86.40.17（Cloudflare 关掉小黄云）。"; \
         echo "DNS 就绪后重新执行本脚本即可。"; exit 2; }
fi

log "6/7 切换到 443 正式配置"
install -m 644 "$APP_DIR/deploy/nginx/${DOMAIN}.conf" "$NGINX_CONF"
nginx -t
systemctl reload nginx

log "7/7 自检"
curl -fsS "http://127.0.0.1:3210/api/health" && echo
curl -fsS -H "Host: ${DOMAIN}" "http://127.0.0.1/api/health" && echo
curl -fsS "https://${DOMAIN}/api/health" && echo

echo -e "\n完成。前端：https://${DOMAIN}/    API：https://${DOMAIN}/api/...（同源）"
