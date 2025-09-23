// ESM - Node 18+
// Agregador liviano sin dependencias externas (usa http y fetch nativo).
import http from 'http';
import { URL } from 'url';

const PORT = Number(process.env.HX_STATUS_PORT || 3031);
const TZ   = process.env.HX_TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Argentina/Buenos_Aires';
const startedAt = Date.now();

const state = {
  sniper: { enabled: false, mode: 'DEMO' },
  counters: {
    discovered: 0,
    pool_active: 0,
    security_pass: 0,
    filters_pass: 0,
    prioritized: 0,
    entries: 0,
    partial_tp: 0,
    stops: 0,
    hits: { ge30: 0, ge50: 0, ge100: 0 },
    api_errors: 0,
    retries: 0,
  },
  pnl_week_usd: 0,
  pnl_month_usd: 0,
  latency_quote_ms: null,
  providers: [
    { name: 'binance', ok: false, lat_ms: null, score: 0.93, sol_usd: null },
    { name: 'rpc',     ok: false, lat_ms: null, score: 0.90 },
  ],
  feed: [], // últimos eventos (para /feed)
};

// ────────────────────────────────────────────────────────────────────────────────
// Helpers
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'access-control-allow-origin': '*',
  });
  res.end(body);
}

async function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function nowLocal() {
  return new Date().toLocaleString('es-AR', {
    timeZone: TZ, hour12: false,
    year: 'numeric', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

function pushFeed(evt) {
  const item = {
    ts: Date.now(),
    type: evt.type || '',
    symbol: evt.symbol ?? null,
    token: evt.token ?? null,
    liq: Number(evt.liq || 0),
    fdv: Number(evt.fdv || 0),
    score: Number(evt.score || 0),
    reason: String(evt.reason || ''),
    up_pct: Number(evt.up_pct || 0),
    realized_usd: evt.realized_usd == null ? null : Number(evt.realized_usd),
    lat_ms: evt.lat_ms == null ? null : Number(evt.lat_ms),
  };
  state.feed.push(item);
  if (state.feed.length > 200) state.feed.splice(0, state.feed.length - 200);
}

// ────────────────────────────────────────────────────────────────────────────────
// Ingesta de eventos M4 → actualiza contadores/PNL/latencias/feed
function applyM4(evt) {
  const t = (evt.type || '').toLowerCase();

  if (t === 'candidate') state.counters.discovered++;
  if (t === 'pool')      state.counters.pool_active++;
  if (t === 'security_pass') state.counters.security_pass++;
  if (t === 'filters_pass')  state.counters.filters_pass++;
  if (t === 'prioritized')   state.counters.prioritized++;

  if (t === 'buy') state.counters.entries++;
  if (t === 'sell') {
    const r = String(evt.reason || '').toLowerCase();
    if (r.includes('tp')) state.counters.partial_tp++;
    else if (r.includes('stop')) state.counters.stops++;
  }

  if (t === 'hit') {
    const up = Number(evt.up_pct || 0);
    if (up >= 30) state.counters.hits.ge30++;
    if (up >= 50) state.counters.hits.ge50++;
    if (up >= 100) state.counters.hits.ge100++;
  }

  if (t === 'pnl' && evt.realized_usd != null) {
    const v = Number(evt.realized_usd || 0);
    state.pnl_week_usd  += v;
    state.pnl_month_usd += v;
  }

  if (t === 'quote' && evt.lat_ms != null) {
    state.latency_quote_ms = Number(evt.lat_ms);
  }

  pushFeed(evt);
}

// ────────────────────────────────────────────────────────────────────────────────
// Probes de proveedores (opcionales, con timeout corto)
async function withTimeout(promise, ms) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), ms);
  try { return await promise(ac.signal); }
  finally { clearTimeout(t); }
}

async function pingBinance(signal) {
  const t0 = Date.now();
  try {
    const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT', { signal });
    const j = await r.json();
    const ms = Date.now() - t0;
    return { ok: true, lat_ms: ms, sol_usd: Number(j.price) || null };
  } catch {
    return { ok: false, lat_ms: null, sol_usd: null };
  }
}

async function pingRPC(signal) {
  const url = process.env.QUICKNODE_URL || process.env.QUICKNODE_RPC_URL || process.env.PUBLIC_SOL_RPC || '';
  if (!url) return { ok: false, lat_ms: null };
  const t0 = Date.now();
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
      signal,
    });
    await r.json();
    const ms = Date.now() - t0;
    return { ok: true, lat_ms: ms };
  } catch {
    return { ok: false, lat_ms: null };
  }
}

async function refreshProviders() {
  try {
    const b = await withTimeout(pingBinance, 5000);
    const q = await withTimeout(pingRPC, 5000);

    // binance
    const p0 = state.providers.find(p => p.name === 'binance');
    if (p0) { p0.ok = b.ok; p0.lat_ms = b.lat_ms; if (b.sol_usd != null) p0.sol_usd = b.sol_usd; }

    // rpc
    const p1 = state.providers.find(p => p.name === 'rpc');
    if (p1) { p1.ok = q.ok; p1.lat_ms = q.lat_ms; }
  } catch {
    // silencioso
  }
}
refreshProviders();
setInterval(refreshProviders, 15000);

// ────────────────────────────────────────────────────────────────────────────────
// HTTP Server
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': 'content-type',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    });
    return res.end();
  }

  try {
    // /health
    if (req.method === 'GET' && url.pathname === '/health') {
      return json(res, 200, {
        ok: true,
        mode: state.sniper.mode,
        uptime_s: Math.floor((Date.now() - startedAt) / 1000),
        p95_ms: 0,
        providers: state.providers,
      });
    }

    // /status
    if (req.method === 'GET' && url.pathname === '/status') {
      return json(res, 200, {
        ts_local: nowLocal(),
        ts_epoch: Date.now(),
        sniper: { ...state.sniper },
        providers: state.providers,
      });
    }

    // /metrics
    if (req.method === 'GET' && url.pathname === '/metrics') {
      return json(res, 200, {
        ok: true,
        counters: state.counters,
        pnl_week_usd: state.pnl_week_usd,
        pnl_month_usd: state.pnl_month_usd,
        latency_quote_ms: state.latency_quote_ms ?? '—',
      });
    }

    // /feed
    if (req.method === 'GET' && url.pathname === '/feed') {
      // El bot espera { candidates: [...] }
      return json(res, 200, { candidates: [...state.feed].reverse() });
    }

    // /events/m4
    if (req.method === 'POST' && url.pathname === '/events/m4') {
      const body = await readJson(req);
      applyM4(body || {});
      return json(res, 200, { ok: true, stored: 1 });
    }

    // /sniper (GET) y /sniper/state (POST)
    if (req.method === 'GET' && url.pathname === '/sniper') {
      return json(res, 200, { enabled: state.sniper.enabled, mode: state.sniper.mode });
    }
    if (req.method === 'POST' && url.pathname === '/sniper/state') {
      const body = await readJson(req);
      if (typeof body.enabled === 'boolean') state.sniper.enabled = body.enabled;
      if (typeof body.mode === 'string' && /^(DEMO|REAL)$/i.test(body.mode))
        state.sniper.mode = body.mode.toUpperCase();
      return json(res, 200, { ok: true, changed: { ...body } });
    }

    // 404
    json(res, 404, { ok: false, error: 'not_found' });
  } catch (e) {
    state.counters.api_errors++;
    json(res, 500, { ok: false, error: String(e && e.message || e) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Agregador escuchando en http://0.0.0.0:${PORT}`);
});
