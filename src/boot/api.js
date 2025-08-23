// ─────────────────────────────────────────────────────────────────────────────
// HUNTER X — API mínima estable (ESM) — HX-API-01 — v2025-08-19
// Secciones:
//   [1] ENV / Constantes
//   [2] State (load/save)
//   [3] Helpers de precio/PNL y botones
//   [4] Finalización de wallet (invariantes DEMO/REAL)
//   [5] Builder de wallet (desde state.json)
//   [6] HTTP Server (CORS, /api/wallet, /api/sell, /api/salud)
//
// Contratos relevantes:
//   GET  /api/wallet?mode=demo|real
//     → { ts, mode, refreshMs, balances:{demo,real}, positions:[...], selectedId, header }
//   POST /api/sell  { posId:string, pct:number(1..100) }
//     → { ok, filledUsd, residualClosed, wallet }
//   GET  /api/salud → [{name,group,label,status,...}]  (best-effort)
//
// Invariantes contables que esta API garantiza:
//   • DEMO: balances.demo.investedUsd = Σ(investedUsd de posiciones DEMO abiertas)
//           balances.demo.cashUsd     = max(0, 10000 - invested)
//           balances.demo.totalUsd    = invested + cash (redondeo 2 dec)
//   • REAL: balances.real.investedUsd = Σ(investedUsd de posiciones REAL abiertas)
//           balances.real.cashUsd se respeta si viene del estado/Phantom (no se recalcula)
//           balances.real.totalUsd    = invested + cash (2 dec)
//   • PnL por posición: pnlPct y pnlUsd calculados con priceNowUsd (normalizado)
//   • Números siempre finitos; 2 decimales donde corresponde.
//
// Notas:
//   • DEMO_PRICE_MODE: 'entry' | 'clamp' | 'live' (por defecto clamp e/multiplicadores)
//   • RESIDUAL_USD: umbral para cerrar residual tras venta parcial
//   • REFRESH_MS: sugerencia de refresco del front
// ─────────────────────────────────────────────────────────────────────────────

import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// [1] ENV / Constantes
// ─────────────────────────────────────────────────────────────────────────────
const PORT        = Number(process.env.API_PORT || 3000);
const REFRESH_MS  = Number(process.env.WALLET_REFRESH_MS || process.env.API_REFRESH_MS || 2000);
const RESIDUAL_USD = Number(process.env.WALLET_RESIDUAL_USD || 1.00);

// Normalización de precios para DEMO
const DEMO_PRICE_MODE      = (process.env.DEMO_PRICE_MODE || 'clamp').toLowerCase(); // 'entry' | 'clamp' | 'live'
const DEMO_PRICE_MIN_MULT  = Number(process.env.DEMO_PRICE_MIN_MULT || 0.5);
const DEMO_PRICE_MAX_MULT  = Number(process.env.DEMO_PRICE_MAX_MULT || 2);

// ─────────────────────────────────────────────────────────────────────────────
// [2] State (load/save)
// ─────────────────────────────────────────────────────────────────────────────
const STATE_PATH = path.resolve('data/state.json');

function loadState(){
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); }
  catch { return {}; }
}
function saveState(st){
  fs.mkdirSync(path.dirname(STATE_PATH), { recursive:true });
  fs.writeFileSync(STATE_PATH, JSON.stringify(st, null, 2));
}

// ─────────────────────────────────────────────────────────────────────────────
// [3] Helpers de precio/PNL y botones
// ─────────────────────────────────────────────────────────────────────────────
function normalizeDemoPrice(entry, market){
  const e = Number(entry||0);
  const m = Number(market||0);
  if (e <= 0) return m > 0 ? m : 0;

  if (DEMO_PRICE_MODE === 'entry') return e;
  if (DEMO_PRICE_MODE === 'clamp') {
    const min  = e * DEMO_PRICE_MIN_MULT;
    const max  = e * DEMO_PRICE_MAX_MULT;
    const base = m > 0 ? m : e;
    return Math.max(min, Math.min(max, base));
  }
  // 'live' u otro → usa mercado (fallback a entry)
  return m > 0 ? m : e;
}

function fixupPositions2(w){
  try{
    const arr = Array.isArray(w?.positions) ? w.positions : [];
    for (const p of arr){
      const entry = Number(p.entryPriceUsd || 0);
      let priceNowUsd = Number(p.priceNowUsd || 0);
      if (!priceNowUsd || priceNowUsd <= 0) priceNowUsd = entry;
      if ((p.mode || 'demo') === 'demo') priceNowUsd = normalizeDemoPrice(entry, priceNowUsd);
      p.priceNowUsd = Number(priceNowUsd || 0);

      const inv = Number(p.investedUsd || 0);
      let pnlPct = 0, pnlUsd = 0;
      if (entry > 0 && inv > 0){
        pnlPct = (p.priceNowUsd / entry - 1) * 100;
        pnlUsd = (pnlPct / 100) * inv;
      }
      p.pnlPct = Number(pnlPct);
      p.pnlUsd = Number(pnlUsd);

      // Botones “sugeridos” (labels informativos)
      p.buttons = p.buttons || {};
      const mkLabel = (pct) => {
        const partUsd = inv * (pct / 100);
        const partPnl = partUsd * (p.pnlPct / 100);
        const s = partPnl >= 0 ? '+' : '-';
        return `${pct}% (${s}$${Math.abs(partPnl).toFixed(2)} · ${p.pnlPct >= 0 ? '+' : ''}${p.pnlPct.toFixed(1)}%)`;
      };
      p.buttons.b25  = { label: mkLabel(25),  data:`sell:${p.id}:25`  };
      p.buttons.b50  = { label: mkLabel(50),  data:`sell:${p.id}:50`  };
      p.buttons.b75  = { label: mkLabel(75),  data:`sell:${p.id}:75`  };
      p.buttons.b100 = { label: '💯 Vender todo', data:`sell:${p.id}:100`, isRemainder:false };
    }
  }catch{}
}

// ─────────────────────────────────────────────────────────────────────────────
// [4] Finalización de wallet (invariantes DEMO/REAL)
// ─────────────────────────────────────────────────────────────────────────────
function finalizeWallet2(w){
  try{
    if (w && w.positions) fixupPositions2(w);
    if (w && w.balances){
      // DEMO — se fuerza base 10k y coherencia con posiciones abiertas
      if (w.balances.demo){
        const inv = Number(
          (w.positions || [])
            .filter(p => (p.mode||'demo') === 'demo' && p.isOpen !== false)
            .reduce((a,p) => a + Number(p.investedUsd||0), 0)
            .toFixed(2)
        );
        const cash = Math.max(0, +(10000 - inv).toFixed(2));
        w.balances.demo.investedUsd = inv;
        w.balances.demo.cashUsd     = cash;
        w.balances.demo.totalUsd    = +(inv + cash).toFixed(2);
      }
      // REAL — respetar cash provisto y sumar invested desde posiciones abiertas
      if (w.balances.real){
        const invR = Number(
          (w.positions || [])
            .filter(p => (p.mode||'demo') === 'real' && p.isOpen !== false)
            .reduce((a,p) => a + Number(p.investedUsd||0), 0)
            .toFixed(2)
        );
        let cashR = Number(w.balances.real.cashUsd || 0);
        if (!Number.isFinite(cashR) || cashR < 0) cashR = 0;
        w.balances.real.investedUsd = invR;
        w.balances.real.cashUsd     = +cashR.toFixed(2);
        w.balances.real.totalUsd    = +(invR + cashR).toFixed(2);
      }
    }
  }catch{}
  return w;
}

// ─────────────────────────────────────────────────────────────────────────────
// [5] Builder de wallet (desde state.json)
// ─────────────────────────────────────────────────────────────────────────────
async function buildWallet(mode = 'demo'){
  const st = loadState();
  st.positions = st.positions || {};

  const demoArr = Array.isArray(st.positions.demo) ? st.positions.demo.filter(p => p.isOpen !== false) : [];
  const realArr = Array.isArray(st.positions.real) ? st.positions.real.filter(p => p.isOpen !== false) : [];
  const positions = [...demoArr, ...realArr];

  const demoInvested = demoArr.reduce((a,p)=> a + Number(p.investedUsd||0), 0);
  const realInvested = realArr.reduce((a,p)=> a + Number(p.investedUsd||0), 0);

  // Caja DEMO: si falta en state, inferir (10k - invertido)
  st.demo = st.demo || {};
  if (typeof st.demo.cash !== 'number') {
    st.demo.cash = Math.max(0, 10000 - demoInvested);
    saveState(st);
  }

  const demoCash = Number(st?.demo?.cash || 0);
  const realCash = Number(st?.real?.cash || 0);

  const wallet = {
    ts: Date.now(),
    mode: String(mode || 'demo').toLowerCase(),
    refreshMs: REFRESH_MS,
    balances: {
      demo: { investedUsd: Number(demoInvested.toFixed(2)), cashUsd: Number(demoCash.toFixed(2)), totalUsd: 0 },
      real: { investedUsd: Number(realInvested.toFixed(2)), cashUsd: Number(realCash.toFixed(2)), totalUsd: 0 },
    },
    positions,
    selectedId: positions[0]?.id || null,
    header: { symbol: '-', pnlText: '$0.00 (+0.0%)' },
  };

  // Normaliza PnL/priceNow y aplica invariantes de balances
  finalizeWallet2(wallet);

  // Header sugerido
  if (wallet.positions.length){
    const p = wallet.positions[0];
    const sign = (Number(p.pnlUsd||0) >= 0) ? '+' : '-';
    wallet.header = {
      symbol: p.symbol || '-',
      pnlText: `${sign}$${Math.abs(Number(p.pnlUsd||0)).toFixed(2)} (${Number(p.pnlPct||0) >= 0 ? '+' : ''}${Number(p.pnlPct||0).toFixed(1)}%)`
    };
  }

  return wallet;
}

// ─────────────────────────────────────────────────────────────────────────────
// [6] HTTP Server
// ─────────────────────────────────────────────────────────────────────────────
const srv = http.createServer(async (req, res) => {
  const write = (code, payload) => {
    res.statusCode = code;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    res.setHeader('access-control-allow-origin', '*');
    res.end(JSON.stringify(payload));
  };

  try{
    const u = new URL(req.url, `http://${req.headers.host}`);
    const path = u.pathname;

    // CORS
    if (req.method === 'OPTIONS'){
      res.setHeader('access-control-allow-origin', '*');
      res.setHeader('access-control-allow-methods', 'GET,POST,OPTIONS');
      res.setHeader('access-control-allow-headers', 'content-type');
      res.statusCode = 204; res.end(); return;
    }

    // GET /api/wallet
    if (req.method === 'GET' && path === '/api/wallet'){
      const mode = (u.searchParams.get('mode') || 'demo').toLowerCase();
      const wallet = await buildWallet(mode);
      return write(200, wallet);
    }

    // POST /api/sell
    if (req.method === 'POST' && path === '/api/sell'){
      const chunks = [];
      for await (const ch of req) chunks.push(ch);
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch {}

      const posId = String(body.posId || '');
      const pct   = Math.max(1, Math.min(100, Number(body.pct || 0)));
      if (!posId) return write(400, { ok:false, error:'posId_required' });

      const st = loadState();
      st.positions = st.positions || {};
      const inDemo = Array.isArray(st.positions.demo) ? st.positions.demo : [];
      const inReal = Array.isArray(st.positions.real) ? st.positions.real : [];
      const findById = (arr) => arr.find(p => p.id === posId);
      const pos = findById(inDemo) || findById(inReal);
      if (!pos || pos.isOpen === false) return write(404, { ok:false, error:'position_not_found' });

      const frac      = pct / 100;
      const invBefore = Number(pos.investedUsd || 0);
      const pieceValue = Number((invBefore * frac).toFixed(2));

      pos.investedUsd = Math.max(0, Number((invBefore - pieceValue).toFixed(2)));

      let residualClosed = false;
      if (pos.investedUsd < RESIDUAL_USD){
        pos.isOpen  = false;
        pos.status  = 'closed';
        pos.closedAt = Date.now();
        residualClosed = true;
      }

      // Contabilidad demo (cash vuelve a la caja demo)
      if ((pos.mode || 'demo') === 'demo'){
        st.demo = st.demo || {};
        const prev = Number(st.demo.cash || 0);
        st.demo.cash = Number((prev + pieceValue).toFixed(2));
      }
      saveState(st);

      const wallet = await buildWallet(pos.mode || 'demo');
      return write(200, {
        ok:true,
        filledUsd: pieceValue,
        residualClosed,
        wallet
      });
    }

    // GET /api/salud
    if (req.method === 'GET' && path === '/api/salud'){
      let checks = [];
      try{
        const mod = await import('../services/health_checks.js');
        const run = mod.runAllChecks || mod.runHealthChecks || mod.runChecks || mod.run;
        checks = run ? await run({ timeoutMs:1500 }) : [];
      }catch{ checks = []; }
      return write(200, checks);
    }

    return write(404, { ok:false, error:'not_found' });
  }catch(e){
    return write(500, { ok:false, error:String(e?.message || e) });
  }
});

srv.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 API escuchando en http://0.0.0.0:${PORT}`);
});

export {};
