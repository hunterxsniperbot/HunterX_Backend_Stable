# HunterX — Arquitectura (visión rápida)

## Capas
- **boot/**: arranque, errores, HTTP keep-alive, API local (`/api/*`), "typing…".
- **services/**: integraciones puras (Supabase, Sheets, QuickNode/Helius, trading helpers).
- **bot/**: callbacks “inline” (p. ej. ventas parciales, recibos).
- **commands/**: comandos de Telegram (UI): `/wallet`, `/registro`, `/salud`, `/control`, etc.
- **http API**: expone `/api/salud`, `/api/wallet`, `/api/sell` para que UI y worker compartan estado.

## Flujo típico
1. **Autosniper (worker)** descubre/filtra → emite compras DEMO/REAL (o señales).
2. **bot/inlinePnlSell** renderiza tarjetas con botones (25/50/75/100%) y manda recibos.
3. **services/supa** persiste cierres (sell) → `/registro` lee y arma historial y resumen.
4. **services/sheets** vuelca a Google (pestañas mensuales o estáticas).
5. **/wallet** y **/control** consultan `/api/wallet` y Supabase para live PnL y PnL realizado.
6. **/salud** toma `/api/salud` (o snapshot local) y muestra fuentes/infra con score.

## Convenciones
- **ESM** (import/export), Node ≥ 18.
- **Formato**: es-AR (hora local via `HX_TZ` / `TZ`).
- **HTML/Markdown**: siempre con fallback seguro para Telegram (sin “parpadeo”).
- **ENV**: `.env` es fuente de verdad. Claves sensibles sólo ahí.

## Claves principales
- Telegram: `BOT_TOKEN|TG_BOT_TOKEN|TELEGRAM_BOT_TOKEN`
- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, `SUPABASE_TABLE_DEMO`, `SUPABASE_TABLE_REAL`
- Sheets: `GOOGLE_APPLICATION_CREDENTIALS`, `GOOGLE_SHEETS_ID`, `SHEETS_TAB_MODE`, tabs DEMO/REAL si `static`
- RPC: `HELIUS_RPC_URL`, `QUICKNODE_URL`
- Datos: `GOPLUS_API_KEY`, `CMC_API_KEY`
- UI/loop: `HX_TZ`, `DEMO_BANK_CAP`, `CONTROL_REFRESH_MS`, `SALUD_REFRESH_MS`

## Invariantes
- Nunca crashear si un proveedor falla (score = 0, nota visible).
- Editar mensajes sólo si el contenido cambió (anti-flicker).
- Persistir en Supabase *antes* de anunciar en Telegram (cuando aplique).
- Sheets: crear pestaña mensual “on-demand” y registrar headers si faltan.

## Módulos clave (por qué existen)
- **commands/control.js**: “dashboard” del trader; capital live, PnL live, PnL del día, accesos rápidos.
- **commands/wallet.js**: abiertos + totales + (opcional) live PnL por posición.
- **commands/registro.js**: cerradas; filtros (hoy/semana/mes/fecha) + link Sheets/tab correcto.
- **commands/salud.js**: estado fuente por fuente; toggles; auto-refresh.
- **bot/inlinePnlSell.js**: lógicas de venta parcial/total + recibos compactos.
- **services/supa.js**: persistencia; `sumClosedPnL`, `listClosedTrades`, `insertClosedTrade`.
- **services/sheets.js**: append + creación de pestaña mensual con encabezados canónicos.
- **boot/api.js**: puente entre procesos (web service/worker) y UI (Telegram).
