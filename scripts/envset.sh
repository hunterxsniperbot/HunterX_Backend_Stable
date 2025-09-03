# Uso:
#   . scripts/envset.sh
#   envset VAR valor
# Reemplaza si existe (línea que empieza con VAR=), si no existe la agrega.
envset() {
  local k="$1"; shift
  local v="$*"
  [ -f .env ] || touch .env
  if grep -qE "^${k}=" .env; then
    local esc="${v//\//\\/}"
    sed -i "s/^${k}=.*/${k}=${esc}/" .env
  else
    printf '%s=%s\n' "$k" "$v" >> .env
  fi
  grep -n "^${k}=" .env
}
