#!/usr/bin/env bash
set -euo pipefail
red(){ printf "\033[31m$*\033[0m\n" >&2; }
grn(){ printf "\033[32m$*\033[0m\n"; }
ylw(){ printf "\033[33m$*\033[0m\n"; }

# 1) Node
REQ=18
CUR=$(node -e 'console.log(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)
[ "$CUR" -ge "$REQ" ] || { red "❌ Node >= $REQ requerido (tienes $CUR)"; exit 1; }

# 2) .env
[ -f .env ] || { red "❌ Falta .env"; exit 1; }
grep -q '^API_HOST=' .env || ylw "⚠️ API_HOST no seteado (pon 127.0.0.1 en dev)"
grep -q '^API_PORT=' .env || ylw "⚠️ API_PORT no seteado (por defecto 3000)"
grep -q '^TELEGRAM_BOT_TOKEN=' .env || ylw "⚠️ Falta TELEGRAM_BOT_TOKEN (solo TG off)"
grep -q '^N8N_WEBHOOK_KEY=' .env || ylw "⚠️ Falta N8N_WEBHOOK_KEY (endpoints protegidos)"

# 3) Secrets opcionales (Sheets)
[ -f secrets/gsa.json ] || ylw "⚠️ secrets/gsa.json no existe (Sheets off)"

# 4) Puerto
PORT=$(grep -E '^API_PORT=' .env | tail -1 | cut -d= -f2)
: "${PORT:=3000}"
if ss -tulpn 2>/dev/null | grep -q ":$PORT "; then
  red "❌ Puerto $PORT ocupado"
  exit 1
fi

grn "✅ Preflight OK: Node $(node -v), puerto $PORT libre, .env presente"
exit 0
