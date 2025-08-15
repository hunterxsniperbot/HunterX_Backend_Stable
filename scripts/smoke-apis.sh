#!/data/data/com.termux/files/usr/bin/bash
# scripts/smoke-apis.sh
[ -z "${BASH_VERSION:-}" ] && exec /data/data/com.termux/files/usr/bin/bash "$0" "$@"
set -Eeuo pipefail
trap 'code=$?; echo "[FAIL] Abortó en línea $LINENO (exit $code)"; exit $code' ERR

# Resolver raíz del repo
if ROOT_GIT="$(git rev-parse --show-toplevel 2>/dev/null)"; then
  ROOT_DIR="$ROOT_GIT"
else
  SCRIPT="$0"
  command -v realpath >/dev/null 2>&1 && SCRIPT="$(realpath "$SCRIPT")" || true
  [ -z "${SCRIPT:-}" ] && SCRIPT="$0"
  SCRIPT_DIR="$(cd "$(dirname "$SCRIPT")" && pwd -P)"
  ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd -P)"
fi
cd "$ROOT_DIR" || { echo "[FAIL] No pude cd al ROOT_DIR=$ROOT_DIR"; exit 1; }

# Cargar .env si existe
HAS_ENV="no"
if [ -f ".env" ]; then
  HAS_ENV="sí"
  set -a; . ./.env; set +a
fi

export NODE_OPTIONS="${NODE_OPTIONS:-"--dns-result-order=ipv4first"}"
mkdir -p logs
DATE_ISO="$(date -u +'%Y-%m-%dT%H:%M:%SZ')"

echo "────────────────────────────────────────────────────────"
echo "HunterX • Smoke APIs • ${DATE_ISO}"
echo "Repo: $ROOT_DIR"
echo ".env presente: $HAS_ENV"
echo "────────────────────────────────────────────────────────"

fail_count=0; warn_count=0
fail(){ echo "[FAIL] $*"; fail_count=$((fail_count+1)); }
warn(){ echo "[WARN] $*"; warn_count=$((warn_count+1)); }
ok(){   echo "[OK]   $*"; }

command -v node >/dev/null 2>&1 || { echo "[FAIL] Node.js no está instalado."; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "[FAIL] curl no está instalado."; exit 1; }

echo; echo "• Telegram"
if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
  fail "TELEGRAM_BOT_TOKEN vacío"
else
  r="$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe" || true)"
  echo "$r" | grep -q '"ok":true' && ok "getMe" || fail "getMe"
  w="$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" || true)"
  echo "$w" | grep -qE '"url":"[^"]+"' && warn "Webhook activo (limpiar con setWebhook url='')" || ok "Webhook vacío (polling)"
fi

echo; echo "• Solana RPC (QuickNode)"
if [ -z "${QUICKNODE_URL:-}" ]; then
  fail "QUICKNODE_URL vacío"
else
  r="$(curl -s -X POST "$QUICKNODE_URL" -H 'Content-Type: application/json' -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' || true)"
  echo "$r" | grep -q '"result"' && ok "getSlot" || fail "getSlot"
fi

echo; echo "• Google Sheets"
node scripts/smoke-apis.js sheets && ok "Sheets" || fail "Sheets"

echo; echo "• Supabase REST"
if [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_KEY:-}" ]; then
  fail "SUPABASE_URL o SUPABASE_KEY vacío"
else
  TABLE="${SUPABASE_TABLE_TRADES:-trades}"
  TMPFILE="$(mktemp)"
  http="$(curl -s -o "$TMPFILE" -w "%{http_code}" \
    -H "apikey: ${SUPABASE_KEY}" -H "Authorization: Bearer ${SUPABASE_KEY}" \
    "${SUPABASE_URL}/rest/v1/${TABLE}?select=count" || true)"
  [ "$http" = "200" ] && ok "REST 200 (${TABLE})" || { fail "REST HTTP $http (${TABLE})"; [ -s "$TMPFILE" ] && tail -n +1 "$TMPFILE"; }
  rm -f "$TMPFILE"
fi

echo; echo "• Agregador de Precios"
node scripts/smoke-apis.js prices && ok "Precios (WSOL/USDC)" || fail "Precios"

echo; echo "• Phantom Key (opcional)"
if [ -z "${PHANTOM_PRIVATE_KEY:-}" ]; then
  warn "PHANTOM_PRIVATE_KEY vacío (salteado)"
else
  node scripts/smoke-apis.js phantom && ok "Phantom pública derivada" || fail "Phantom key"
fi

echo; echo "────────────────────────────────────────────────────────"
echo "Resumen: FAILS=$fail_count  WARNS=$warn_count"
[ "$fail_count" -eq 0 ] && echo "Estado: TODO VERDE" || echo "Estado: Revisar fallos arriba"
exit $([ "$fail_count" -eq 0 ] && echo 0 || echo 1)
