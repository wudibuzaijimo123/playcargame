#!/usr/bin/env bash
# DNS 指向本机后，一条命令切到 HTTPS：签发证书 + 换成 443 正式配置
# 用法：bash /opt/playcargame/deploy/enable-tls.sh
set -euo pipefail

APP_DIR=/opt/playcargame
DOMAIN=game.yhj123.dpdns.org
NGINX_CONF=/etc/nginx/conf.d/${DOMAIN}.conf
WEBROOT=/var/www/letsencrypt

[ "$(id -u)" = "0" ] || { echo "请用 root 运行"; exit 1; }
mkdir -p "$WEBROOT"

echo "== 当前 DNS 解析 =="
getent hosts "$DOMAIN" || true

if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  echo "== 申请证书 =="
  certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" \
    --non-interactive --agree-tos --register-unsafely-without-email --keep-until-expiring
fi

echo "== 安装 443 配置 =="
install -m 644 "$APP_DIR/deploy/nginx/${DOMAIN}.conf" "$NGINX_CONF"
nginx -t
systemctl reload nginx

echo "== 自检 =="
curl -fsS "https://${DOMAIN}/api/health" && echo
echo "HTTPS 已启用：https://${DOMAIN}/"
