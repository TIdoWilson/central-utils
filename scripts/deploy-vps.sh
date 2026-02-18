#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/central-utils}"
BRANCH="${1:-main}"

if [[ ! -d "$APP_DIR/.git" ]]; then
  echo "[deploy] ERRO: repositório não encontrado em $APP_DIR" >&2
  exit 1
fi

run_systemctl() {
  if command -v systemctl >/dev/null 2>&1; then
    if [[ "$(id -u)" -eq 0 ]]; then
      systemctl "$@"
    else
      sudo systemctl "$@"
    fi
  fi
}

echo "[deploy] APP_DIR=$APP_DIR"
echo "[deploy] BRANCH=$BRANCH"

cd "$APP_DIR"

echo "[deploy] git fetch"
git fetch --all --prune

echo "[deploy] git checkout $BRANCH"
git checkout "$BRANCH"

echo "[deploy] git pull"
git pull --ff-only origin "$BRANCH"

if [[ -f package-lock.json ]]; then
  echo "[deploy] npm ci"
  npm ci
else
  echo "[deploy] npm install"
  npm install
fi

if [[ -d .venv ]]; then
  VENV_PY=".venv/bin/python"
else
  echo "[deploy] criando .venv"
  python3 -m venv .venv
  VENV_PY=".venv/bin/python"
fi

echo "[deploy] pip upgrade"
"$VENV_PY" -m pip install --upgrade pip

if [[ -f api/requirements.txt ]]; then
  echo "[deploy] pip install -r api/requirements.txt"
  "$VENV_PY" -m pip install -r api/requirements.txt
fi

if [[ -f requirements.txt ]]; then
  echo "[deploy] pip install -r requirements.txt"
  "$VENV_PY" -m pip install -r requirements.txt
fi

if [[ -f scripts/verify.mjs ]]; then
  echo "[deploy] npm run verify"
  npm run verify || true
fi

echo "[deploy] daemon-reload"
run_systemctl daemon-reload || true

for svc in central-python central-go central-node caddy; do
  if systemctl list-unit-files | grep -q "^${svc}\\.service"; then
    echo "[deploy] restart $svc"
    run_systemctl restart "$svc"
  else
    echo "[deploy] aviso: serviço $svc não encontrado, pulando"
  fi
done

echo "[deploy] status"
for svc in central-python central-go central-node caddy; do
  if systemctl list-unit-files | grep -q "^${svc}\\.service"; then
    run_systemctl status "$svc" --no-pager | sed -n '1,12p' || true
  fi
done

echo "[deploy] concluído"
