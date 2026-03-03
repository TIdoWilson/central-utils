#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/central-utils}"
APP_USER="${APP_USER:-root}"
APP_GROUP="${APP_GROUP:-root}"

export DEBIAN_FRONTEND=noninteractive

apt-get update
apt-get install -y \
  git \
  curl \
  ca-certificates \
  python3 \
  python3-venv \
  python3-pip \
  build-essential

if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_GROUP" "$APP_DIR"

if ! systemctl list-unit-files | grep -q '^caddy\.service'; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

ufw allow 22/tcp || true
ufw allow 80/tcp || true
ufw allow 443/tcp || true
ufw --force reload || true

cat <<INFO
[post-install] Bootstrap concluído.
[post-install] Próximos passos:
  1. git clone <repo> "$APP_DIR"   (se ainda não existir)
  2. copiar .env para "$APP_DIR/.env"
  3. cd "$APP_DIR" && bash scripts/deploy-vps.sh main
INFO
