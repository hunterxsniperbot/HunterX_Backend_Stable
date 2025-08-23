// src/boot/api.js — API mínima y estable (ESM)
// Endpoints:
//   GET  /api/wallet?mode=demo|real
//   POST /api/sell  { posId, pct }
//   GET  /api/salud
//
// Diseño:
// - DEMO: el balance se deriva SIEMPRE de posiciones abiertas (base 10k).
// - REAL: respeta el cash que traiga el state (ej. Phantom), sólo normaliza números.
// - fixupPositions: calcula priceNowUsd (con clamp en DEMO), PnL y botones 25/50/75/💯.
// - Sin funciones duplicadas. Sin “2” (no hay fixupPositions2/finalizeWallet2).

import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';

// ===================== ENV / CONSTANTES =====================
const PORT        = Number(process.env.API_PORT || 3000);
const REFRESH_MS  = Number(process.env.WALLET_REFRESH_MS || process.env.API_REFRESH_MS || 2000);
const RESIDUAL_USD = Number(process.env.WALLET_RESIDUAL_USD || 1.00);

// Normalización de precios DEMO
const DEMO_PRICE_MODE      = process.env.DEMO_PRICE_MODE || 'clamp'; // 'live' | 'entry' | 'clamp'
const DEMO_PRICE_MIN_MULT  = Number(process.env.DEMO_PRICE_MIN_MULT || 0.5);
const DEMO_PRICE_MAX_MULT  = Number(process.env.DEMO_PRICE_MAX_MULT || 2);

// ===================== STATE (archivo JSON) =====================
const STATE_PATH = path.resolve('data/state.json');

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return {}; }
}
function saveState(st) {
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(st, null, 2));
}

// ===================== HELPERS PRECIO/PNL =====================
function normalizeDemoPrice(entry, market) {
  const e = Number(entry || 0);
  const m = Number(market || 0);
  if (e <= 0) return m > 0 ? m : 0;

  if (DEMO_PRICE_MODE === 'entry') return e;
  if (DEMO_PRICE_MODE === 'clamp') {
    const min = e * DEMO_PRICE_MIN_MULT;
    const max = e * DEMO_PRICE_MAX_MULT;
    const base = m > 0 ? m : e;
    return Math.max(min, Math.min(max, base));
  }
  // 'live' o cualquier otra cosa: usa mercado (fallback a entry)
  return m > 0 ? m : e;
}

/**
 * Enriquecer posiciones: priceNowUsd (demo clamped), pnlUsd/pnlPct y etiquetas de botones
 * Mutación in-place de cada posición.
 */
function fixupPositions(body) {
  try {
    const arr = Array.isArray(body?.positions) ? body.positions : [];
    for (const p of arr) {
      const entry = Number(p.entryPriceUsd || 0);
      let priceNowUsd = Number(p.priceNowUsd || 0);
      if (!priceNowUsd || priceNowUsd <= 0) priceNowUsd = entry;
      if ((p.mode || 'demo') === 'demo') priceNowUsd = normalizeDemoPrice(entry, priceNowUsd);
      p.priceNowUsd = priceNowUsd;

      const inv = Number(p.investedUsd || 0);
      let pnlPct = 0, pnlUsd = 0;
      if (entry > 0 && inv > 0) {
        pnlPct = (priceNowUsd / entry - 1) * 100;
        pnlUsd = (pnlPct / 100) * inv;
      }
      p.pnlPct = Number(pnlPct);
      p.pnlUsd = Number(pnlUsd);

      // Botones (recalculados con PnL actual)
      p.buttons = p.buttons || {};
      const mkLabel = (pct) => {
        const partUsd = inv * (pct / 100);
        const partPnl = partUsd * (p.pnlPct / 100);
        const s = partPnl >= 0 ? '+' : '-';
        return `${pct}% (${s}$${Math.abs(partPnl).toFixed(2)} · ${p.pnlPct >= 0 ? '+' : ''}${p.pnlPct.toFixed(1)}%)`;
      };
      p.buttons.b25  = { label: mkLabel(25), data: `sell:${p.id}:25` };
      p.buttons.b50  = { label: mkLabel(50), data: `sell:${p.id}:50` };
      p.buttons.b75  = { label: mkLabel(75), data: `sell:${p.id}:75` };
      p.buttons.b100 = { label: '💯 Vender todo', data: `sell:${p.id}:100`, isRemainder: false };
    }
  } catch {}
}

/**
 * Normaliza balances y aplica fixupPositions. Devuelve el mismo objeto (mutado).
 * - DEMO: invested = suma posiciones demo abiertas; cash = 10000 - invested (>=0); total = 10000
 * - REAL: invested = suma posiciones real abiertas; cash = cash existente saneado; total = inv + cash
 */
function finalizeWallet(w) {
  try {
    if (w && w.positions) fixupPositions(w);

    if (w && w.balances) {
      // DEMO
      if (w.balances.demo) {
        const inv = Number((w.positions || [])
          .filter(p => (p.mode || 'demo') === 'demo' && p.isOpen !== false)
          .reduce((a, p) => a + Number(p.investedUsd || 0), 0)
          .toFixed(2));
        const cash = Math.max(0, +(10000 - inv).toFixed(2));
        w.balances.demo.investedUsd = inv;
        w.balances.demo.cashUsd     = cash;
        w.balances.demo.totalUsd    = +(inv + cash).toFixed(2);
      }
      // REAL
      if (w.balances.real) {
        const invR = Number((w.positions || [])
          .filter(p => (p.mode || 'demo') === 'real' && p.isOpen !== false)
          .reduce((a, p) => a + Number(p.investedUsd || 0), 0)
          .toFixed(2));
        let cashR = Number(w.balances.real.cashUsd || 0);
        if (!Number.isFinite(cashR) || cashR < 0) cashR = 0;
        w.balances.real.investedUsd = invR;
        w.balances.real.cashUsd     = +cashR.toFixed(2);
        w.balances.real.totalUsd    = +(invR + cashR).toFixed(2);
      }
    }
  } catch {}
  return w;
}

// ===================== WALLET BUILDER =====================
async function buildWallet(mode = 'demo') {
  const st = loadState();
  st.positions = st.positions || {};

  const demoArr = Array.isArray(st.positions.demo) ? st.positions.demo.filter(p => p.isOpen !== false) : [];
  const realArr = Array.isArray(st.positions.real) ? st.positions.real.filter(p => p.isOpen !== false) : [];
  const positions = [...demoArr, ...realArr];

  // Totales base (serán recalculados por finalizeWallet)
  const demoInvested = demoArr.reduce((a, p) => a + Number(p.investedUsd || 0), 0);
  const realInvested = realArr.reduce((a, p) => a + Number(p.investedUsd || 0), 0);

  // Caja DEMO inicial si falta (solo para compat; finalizeWallet recalcula igual)
  st.demo = st.demo || {};
  if (typeof st.demo.cash !== 'number') {
    st.demo.cash = Math.max(0, 10000 - demoInvested);
    saveState(st);
  }

  const demoCash = Number(st?.demo?.cash || 0);
  const realCash = Number(st?.real?.cash || 0);

  const wallet = {
    ts: Date.now(),
    mode,
    refreshMs: REFRESH_MS,
    balances: {
      demo: { investedUsd: demoInvested, cashUsd: demoCash, totalUsd: demoInvested + demoCash },
      real: { investedUsd: realInvested, cashUsd: realCash, totalUsd: realInvested + realCash },
    },
    positions,
    selectedId: positions[0]?.id || null,
    header: { symbol: '-', pnlText: '$0.00 (+0.0%)' },
  };

  // Normaliza y calcula PnL/balances
  finalizeWallet(wallet);

  // Header rápido
  if (wallet.positions.length) {
    const p = wallet.positions[0];
    const sign = p.pnlUsd >= 0 ? '+' : '';
    wallet.header = {
      symbol: p.symbol || '-',
      pnlText: `${sign}$${Math.abs(Number(p.pnlUsd || 0)).toFixed(2)} (${p.pnlPct >= 0 ? '+' : ''}${Number(p.pnlPct || 0).toFixed(1)}%)`
    };
  }

  return wallet;
}

// ===================== HTTP SERVER =====================
const srv = http.createServer(async (req, res) => {
  const write = (code, payload) => {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('access-control-allow-origin', '*');
    res.end(JSON.stringify(payload));
  };

  try {
    const u = new URL(req.url, `http://${req.headers.host}`);
    const path = u.pathname;

    // CORS
    if (req.method === 'OPTIONS') {
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type');
      res.statusCode = 204; res.end(); return;
    }

    // GET /api/wallet
    if (req.method === 'GET' && path === '/api/wallet') {
      const mode = (u.searchParams.get('mode') || 'demo').toLowerCase();
      const wallet = await buildWallet(mode);
      return write(200, finalizeWallet(wallet));
    }

    // POST /api/sell
    if (req.method === 'POST' && path === '/api/sell') {
      // body
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}

      const posId = String(body.posId || '');
      const pct   = Math.max(1, Math.min(100, Number(body.pct || 0)));

      const st = loadState();
      st.positions = st.positions || {};
      const inDemo = Array.isArray(st.positions.demo) ? st.positions.demo : [];
      const inReal = Array.isArray(st.positions.real) ? st.positions.real : [];
      const findById = (arr) => arr.find(p => p.id === posId);
      const pos = findById(inDemo) || findById(inReal);
      if (!pos || pos.isOpen === false) return write(404, { ok: false, error: 'position_not_found' });

      const frac = pct / 100;
      const invBefore  = Number(pos.investedUsd || 0);
      const pieceValue = invBefore * frac;

      pos.investedUsd = Math.max(0, invBefore - pieceValue);

      let residualClosed = false;
      if (pos.investedUsd < RESIDUAL_USD) {
        pos.isOpen  = false;
        pos.status  = 'closed';
        pos.closedAt= Date.now();
        residualClosed = true;
      }

      if ((pos.mode || 'demo') === 'demo') {
        st.demo = st.demo || {};
        st.demo.cash = Number((Number(st.demo.cash || 0) + pieceValue).toFixed(2));
      }
      saveState(st);

      const wallet = await buildWallet(pos.mode || 'demo');
      return write(200, {
        ok: true,
        filledUsd: +pieceValue.toFixed(2),
        residualClosed,
        wallet: finalizeWallet(wallet)
      });
    }

    // GET /api/salud
    if (req.method === 'GET' && path === '/api/salud') {
      let checks = [];
      try {
        const mod = await import('../services/health_checks.js');
        const run = mod.runAllChecks || mod.runHealthChecks || mod.runChecks || mod.run;
        checks = run ? await run({ timeoutMs: 1500 }) : [];
      } catch { checks = []; }
      return write(200, checks);
    }

    return write(404, { ok: false, error: 'not_found' });
  } catch (e) {
    return write(500, { ok: false, error: String(e?.message || e) });
  }
});

srv.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 API escuchando en http://0.0.0.0:${PORT}`);
});

export {};
