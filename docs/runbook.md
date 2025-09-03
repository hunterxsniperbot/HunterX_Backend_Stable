# Runbook (operación y errores comunes)

## Arranque limpio
pkill -9 node || true
export NODE_OPTIONS=--dns-result-order=ipv4first
node index.js

## Puerto 3000 ocupado (EADDRINUSE)
# Ver quién usa :3000 (informativo)
ss -lptn 'sport = :3000' || true
# Solución: cerrar procesos node duplicados
pkill -9 node || true
node index.js

## Telegram ECONNABORTED / ENOTFOUND
- Redes móviles suelen cortar sockets largos. El bot reintenta.
- Probar Wi-Fi o modo avión 5s.
- Confirmar que API de Telegram responde:
  curl -I https://api.telegram.org

## Fuentes de mercado lentas
- Subir MARKETS_TIMEOUT_MS y MARKETS_BACKOFF_MS en .env
- Probar `/candidatos raw` para ver si hay data cruda

## Google Sheets
- Verificar GOOGLE_SHEETS_ID y credenciales en ./secrets/gsa.json
- Probar `/registro_export`
