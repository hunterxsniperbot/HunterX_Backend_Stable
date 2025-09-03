import express from 'express';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

// health mínimo
app.get('/api/healthz', (_req, res)=> res.json({ ok:true, ts: Date.now() }));

// status básico (no rompe si faltan exports)
app.get('/api/autosniper/status', async (_req, res) => {
  try {
    let summary = null;
    try {
      const st = await import('./src/services/state.js');
      summary = st.getWalletSummary ? await st.getWalletSummary()
               : (st.getState ? await st.getState() : null);
    } catch {}
    res.json(summary || { ok:true, mode:'demo', autosniper:false });
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

const PORT = Number(process.env.API_PORT || 3000);
// app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 API escuchando en http://0.0.0.0:${PORT}`);
});

// ---- Safe listen (HOST/PORT desde env) + singleton ----
const HOST = process.env.API_HOST || '127.0.0.1';
const PORT = Number(process.env.API_PORT || 3000);

// cerrar server anterior si quedó en memoria (por reloads)
if (globalThis.__HX_API_SERVER) {
  try { globalThis.__HX_API_SERVER.close(()=>{}); } catch {}
  globalThis.__HX_API_SERVER = null;
}

const server = app.listen(PORT, HOST, () => {
  console.log(`🌐 API escuchando en http://${HOST}:${PORT}`);
});
globalThis.__HX_API_SERVER = server;

// --- SALUD FAST: responde siempre < ~1s, no bloquea ---
async function hxFetch(name, url, timeoutMs=800) {
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
  const out = {
    name, group: url ? 'data' : 'infra',
    status: 'DOWN', p50_ms: null, p95_ms: null, timeout_pct: 100
  };
  const t0 = Date.now();
  try {
    if (!url) { // checks internos (no red)
      out.status = 'OK';
      out.timeout_pct = 0;
      return out;
    }
    const r = await fetch(url, { signal: ac.signal, headers:{'user-agent':'Mozilla/5.0'} });
    out.status = r.ok ? 'OK' : 'DOWN';
    out.http = r.status;
  } catch(e) {
    out.error = String(e?.message || e);
  } finally {
    clearTimeout(t);
    const dt = Date.now() - t0;
    out.latency_ms = dt; out.p50_ms = dt; out.p95_ms = dt;
  }
  return out;
}

app.get('/api/salud_fast', async (_req,res) => {
  try {
    const timeout = Number(process.env.SALUD_FAST_TIMEOUT_MS || 800);
    const checks = await Promise.allSettled([
      hxFetch('TG mode', null, timeout),                                  // interno (si tu bot está vivo)
      hxFetch('Phantom', null, timeout),                                   // config interna
      hxFetch('CoinGecko', 'https://api.coingecko.com/api/v3/ping', timeout),
      hxFetch('DexScreener', 'https://api.dexscreener.com/latest/dex/search?q=sol', timeout),
    ]);
    const arr = checks.map(c => c.status==='fulfilled' ? c.value : ({ name:'err', group:'data', status:'DOWN'}));
    res.json(arr);
  } catch(e) {
    res.status(500).json([{ name:'salud_fast', group:'infra', status:'DOWN', error:String(e?.message||e)}]);
  }
});
