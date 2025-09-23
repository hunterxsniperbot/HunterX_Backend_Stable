# Hunter X – SniperBot Backend Stable

**Arquitecto Senior & Desarrollador de Bots de Trading de Criptomonedas**

**Objetivo:**  
Crear un sniper automático élite en Telegram para operar tokens en los primeros minutos tras su lanzamiento, maximizando ROI y minimizando riesgos.

---

## 🔐 Wallet & Infraestructura

- **Repositorio (GitHub):** `hunterxsniperbot/HunterX_Backend_Stable`  
- **Backend Deployment:** Render  
- **Base de Datos:** Supabase  
- **RPC (Blockchain Solana):** QuickNode  
- **Phantom Wallet:** Conexión segura para firmar transacciones  
- **Registro de Ventas:** Google Sheets  

---

## 🛰️ Fuentes de Datos en Tiempo Real

- DexScreener  
- TokenSniffer  
- Whale Alert  
- TensorFlow (Colab)  
- Solscan  
- Pump.fun  
- Jupiter  
- Raydium  
- CoinGecko  
- Discord  

---
HunterX — Backend Stable

1) Descripción

HunterX es un bot de Telegram para descubrir y operar oportunidades en Solana.
Corre en Android/Termux o en Render (Web Service + Worker).
Consta de:

un agregador local (health/status/metrics/feed),

un proxy que normaliza y completa datos para la UI,

un bot (polling) con comandos /estado y /control,

integraciones (RPC, seguridad, precios/rutas) y Supabase para registro.


2) Arquitectura (alto nivel)

Agregador: expone /health, /status, /metrics, /feed, /events/m4, /sniper/state.

Proxy de estado: reexpone /status garantizando sol_usd y p95_ms, y normaliza providers.

Bot: consume solo el proxy; entrega UX clara, autorefresh opcional.

DEMO: pipelines demo_scan y demo_engine simulan actividad para probar UI sin riesgo.

REAL: autoSniper separado, con controles de riesgo.


3) Componentes

Bot (polling): handlers por comando y callbacks (UX y control).

Agregador: centraliza integraciones y estado.

Proxy: sanea y completa campos críticos para la UI.

Supabase: persistencia y auditoría.

Integraciones: Helius/QuickNode (RPC), DexScreener/Birdeye (descubrimiento), GoPlus (seguridad), Jupiter/Raydium (rutas/exec), Oráculo SOL/USD (Pyth/Switchboard), CoinGecko/CMC (referencia).


4) Endpoints

Agregador:
/health, /status, /metrics, /feed, /events/m4, /sniper/state

Proxy:
/status (enriquecido), /health, /metrics


5) Comandos de Telegram

/estado: snapshot (Modo, Sniper, SOL/USD, p95, Hora 24h AR, Proveedores) + 🔄 / Auto 15s.

/control: operativa (hoy/semana/mes, hits por tramo, latencia, fuentes, PnL) + 🔄 / Auto 15s.

/demo y /real: cambio de modo.

/ayuda: guía rápida.

Ocultos: /autosniper, /sniperctl, /diag (admin).


6) Variables de entorno (clave)

Bot/Proxy:
HX_STATUS_URL (bot ⇒ proxy /status), HX_STATUS_BASE, HX_STATUS_PROXY_PORT, HX_STATUS_TIMEOUT_MS.

DEMO:
HX_DEMO_SCAN, HX_DEMO_ENGINE, HX_DEMO_SEEDER, HX_DEMO_SEEDS, HX_MIN_LIQ_USD, HX_MAX_FDV_USD, HX_HTTP_TIMEOUT_MS.

Integraciones: claves RPC, GoPlus, Sheets, Supabase, etc.

REAL: sizing/cooldown/whitelist/blacklist/rate-limits, credenciales de wallet.


7) Modos

DEMO: simula feed/quotes/ejecuciones; valida UX y contadores.

REAL: autosniper con controles de riesgo, persistencia y oráculo de precio.


8) Observabilidad

Proxy evita “—” (rellena sol_usd y p95_ms) y normaliza providers.

Métricas en /metrics.

Logs con prefijos claros.


9) Seguridad

.env fuera del repo; secretos en variables del entorno (Render/Termux).

Mínimos permisos en proveedores.

Oráculo SOL/USD recomendado (Pyth/Switchboard).


10) Deploy en Render

Web Service: agregador; expone /health; escucha $PORT.

Worker: bot en polling.

Worker env: HX_STATUS_URL=https://<web-service>.onrender.com/status.

Validar pos-deploy: getMe, /health, /status, /estado y /control en Telegram.


11) Roadmap

Ver Notion: baseline, UX, DEMO, REAL, procesos, observabilidad, seguridad, Render, CI/CD, docs, hardening.

12) Licencia / Descargo

Uso bajo tu responsabilidad; el modo REAL implica riesgo de mercado.
