// ─────────────────────────────────────────────────────────────────────────────
// HUNTER X — Ventas parciales (callback) — HX-A04 — v2025-08-20 (ESM)
// Propósito:
//   • Manejar callbacks "sell:posId:pct" con confirmación, anti-doble-tap y residual
//   • Primer intento: API-first → POST /api/sell
//   • Fallback opcional (si lo habilitás) a estado local (state.json) + precio de markets
//   • Logging de eventos a Supabase (si trading.logEvent está disponible)
//
// Importante (para no chocar con wallet.js):
//   • Este handler queda DESACTIVADO por default.
//   • Activalo sólo si querés delegar aquí las ventas: WALLET_SELL_VIA_HANDLER=1
//   • Si lo activás, tu /wallet seguirá mostrando y refrescando bien (el mensaje
//     se puede refrescar con el botón 🔄). Este handler no re-renderiza la wallet,
//     muestra toast de éxito/fracaso y deja el refresh al usuario.
//
// ENV:
//   WALLET_SELL_VIA_HANDLER=1      → habilita este handler (default: 0 = off)
//   API_BASE=http://127.0.0.1:3000 → base de la API (default local)
//   SELL_CONFIRM=1                 → requiere 2º tap en ≤10s para ejecutar (default: 1)
//   SELL_CONFIRM_WINDOW_MS=10000   → ventana de confirmación (ms)
//   RESIDUAL_USD_THRESHOLD=1       → umbral para cerrar posición por residuo
//   USE_LOCAL_STATE=0              → si la API falla, intentar fallback a state.json
//
// Invariantes:
//   • pct ∈ [1..100]
//   • Evita ejecutar 2 ventas simultáneas del mismo posId en la misma ventana
//   • Si API responde ok → mostramos monto ejecutado y “(pos. cerrada)” si aplica
//   • Si API falla y no hay fallback → error corto y claro
// ─────────────────────────────────────────────────────────────────────────────

const ENABLED = String(process.env.WALLET_SELL_VIA_HANDLER || '0') === '1';
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const RESID = Math.max(0, Number(process.env.RESIDUAL_USD_THRESHOLD || 1));
const REQUIRE_CONFIRM = String(process.env.SELL_CONFIRM ?? '1') === '1';
const CONFIRM_WIN = Math.max(1000, Number(process.env.SELL_CONFIRM_WINDOW_MS || 10000));
const USE_LOCAL_FALLBACK = String(process.env.USE_LOCAL_STATE || '0') === '1';

import * as markets from '../services/markets.js';
import trading from '../services/trading.js';

// Fallback local (opcional). Cargado dinámicamente para no exigir estos módulos si no los usás.
async function tryLocalSell(posId, pct) {
  if (!USE_LOCAL_FALLBACK) throw new Error('api_failed_no_fallback');
  let loadState, saveState;
  try {
    const mod = await import('../services/state_compat.js');
    loadState = mod.loadState; saveState = mod.saveState;
  } catch {
    throw new Error('fallback_missing_state');
  }

  const st = loadState();
  st.positions = st.positions || {};
  const arrDemo = Array.isArray(st.positions.demo) ? st.positions.demo : [];
  const arrReal = Array.isArray(st.positions.real) ? st.positions.real : [];
  const all = [...arrDemo, ...arrReal];

  const pos = all.find(p => p && p.id === posId && (p.isOpen !== false));
  if (!pos) throw new Error('position_not_found');

  const invBefore = Number(pos.investedUsd || 0);
  if (invBefore <= 0.001) throw new Error('empty_position');

  // Precio actual (best-effort)
  let priceNow = 0;
  try { priceNow = Number(await markets.getPrice(pos.mint)) || 0; } catch {}
  if (priceNow <= 0) throw new Error('price_unavailable');

  const frac = Math.max(1, Math.min(100, Number(pct))) / 100;
  let sellUsd = invBefore * frac;
  if (sellUsd > invBefore) sellUsd = invBefore;

  const entry = Number(pos.entryPriceUsd || 0);
  const gainPct = entry > 0 ? (priceNow / entry - 1) : 0;
  const realized = sellUsd * gainPct;

  // Aplicar venta y residual
  pos.investedUsd = Math.max(0, invBefore - sellUsd);
  pos.partialCount = (pos.partialCount || 0) + 1;
  let residualClosed = false;
  if (pos.investedUsd < RESID) {
    pos.investedUsd = 0;
    pos.isOpen = false;
    pos.status = 'closed';
    pos.closedAt = Date.now();
    residualClosed = true;
  }

  // Cash DEMO/REAL
  const mode = (pos.mode === 'real') ? 'real' : 'demo';
  st[mode] = st[mode] || {};
  if (typeof st[mode].cash !== 'number') st[mode].cash = 0;
  st[mode].cash = Math.max(0, Number(st[mode].cash) + sellUsd + realized);

  saveState(st);

  return {
    ok: true,
    filledUsd: +sellUsd.toFixed(2),
    residualClosed,
    pnlRealizedUsd: +realized.toFixed(2),
  };
}

// Control de confirmación y de concurrencia
const pendingConfirm = new Map(); // key: chatId:posId:pct -> ts
const inflight = new Set();       // key: chatId:posId:pct (para evitar doble ejecución)

function keyFor(chatId, posId, pct) { return `${chatId}:${posId}:${pct}`; }
function withinConfirmWin(ts) { return (Date.now() - ts) <= CONFIRM_WIN; }

async function apiSell(posId, pct) {
  const r = await fetch(`${API_BASE}/api/sell`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ posId, pct: Number(pct) })
  });
  if (!r.ok) throw new Error(`api_http_${r.status}`);
  return r.json();
}

// Texto de resultado breve
function toastForResult(pct, res) {
  const filled = typeof res?.filledUsd === 'number'
    ? `$${Number(res.filledUsd).toFixed(2)}`
    : '';
  const extra = res?.residualClosed ? ' · pos. cerrada' : '';
  return `✅ Vendido ${pct}% · ${filled}${extra}`;
}

export default function attachWalletSell(bot){
  if (!ENABLED) {
    console.log('ℹ️  wallet_sell: deshabilitado (WALLET_SELL_VIA_HANDLER!=1)');
    return;
  }
  console.log('🟩 wallet_sell: habilitado (manejando callbacks "sell:posId:pct")');

  bot.on('callback_query', async (q) => {
    const data = String(q.data || '');
    const m = data.match(/^sell:([^:]+):(\d{1,3})$/);
    if (!m) return;

    const chatId = q.message?.chat?.id;
    if (!chatId) return;

    const posId = m[1];
    const pct = Math.max(1, Math.min(100, Number(m[2] || 0)));
    const k = keyFor(chatId, posId, pct);

    try {
      // Confirmación doble tap (si está activa)
      if (REQUIRE_CONFIRM) {
        const ts = pendingConfirm.get(k);
        if (!ts || !withinConfirmWin(ts)) {
          pendingConfirm.set(k, Date.now());
          await bot.answerCallbackQuery(q.id, {
            text: `Tocá de nuevo en ≤${Math.round(CONFIRM_WIN/1000)}s para vender ${pct}%`,
            show_alert: false
          }).catch(()=>{});
          return;
        }
        // ya estaba pendiente, seguimos y limpiamos
        pendingConfirm.delete(k);
      }

      // Anti-doble-tap en ejecución
      if (inflight.has(k)) {
        await bot.answerCallbackQuery(q.id, { text:'⏳ Ejecutando…', show_alert:false }).catch(()=>{});
        return;
      }
      inflight.add(k);

      // 1) API-first
      let result;
      try {
        result = await apiSell(posId, pct);
      } catch (apiErr) {
        // 2) Fallback local opcional
        if (USE_LOCAL_FALLBACK) {
          result = await tryLocalSell(posId, pct);
        } else {
          throw apiErr;
        }
      }

      // Log (best-effort)
      try {
        await trading.logEvent?.({
          type: 'sell_partial',
          fuente: 'wallet_handler',
          extra: { posId, pct, filledUsd: result?.filledUsd, residualClosed: !!result?.residualClosed }
        });
      } catch {}

      // Toast
      await bot.answerCallbackQuery(q.id, { text: toastForResult(pct, result), show_alert:false }).catch(()=>{});

      // NOTA: no re-renderizamos aquí el mensaje /wallet para no duplicar
      // la lógica de UI. El usuario puede tocar 🔄 Refrescar (o, si usás el
      // wallet.js que te pasé, él ya refresca después de vender).

    } catch (e) {
      const msg = String(e?.message || e || 'error');
      let nice = '❌ Error';
      if (/position_not_found/.test(msg)) nice = '❌ Posición no encontrada';
      else if (/empty_position/.test(msg)) nice = '❌ Sin saldo en posición';
      else if (/price_unavailable/.test(msg)) nice = '❌ Precio no disponible';
      else if (/api_http_/.test(msg)) nice = '❌ API venta: error';
      else if (/api_failed_no_fallback/.test(msg)) nice = '❌ API caída y sin fallback local';
      await bot.answerCallbackQuery(q.id, { text: nice, show_alert:false }).catch(()=>{});
    } finally {
      inflight.delete(k);
    }
  });
}
