// ─────────────────────────────────────────────────────────────────────────────
// HUNTER X — Health Checks — HX-HC-01 — v2025-08-19 (ESM)
// Propósito:
//   • Proveer un panel de salud homogéneo para /api/salud y /health (Telegram).
//   • Medir latencias y estabilidad por proveedor, con degradación elegante.
//   • Mantener pequeña memoria de métricas (p50/p95/timeout%) por servicio.
// Salida:
//   Array de objetos: { name, group, label?, status, latency_ms?, http?, reason?,
//                       p50_ms?, p95_ms?, timeout_pct? }
// Notas:
//   • No rompe si faltan claves: marca CONFIG/➖ y sigue.
//   • TG mode etiqueta POLLING/WEBHOOK por ENV.
//   • Score global se arma con formatSummary() (para tu /health textual).
// Dependencias locales: ./health_common.js (getJson, postJson, sleep, scoreFrom)
// ─────────────────────────────────────────────────────────────────────────────

import { getJson, postJson, sleep, scoreFrom } from './health_common.js';

// ─────────────────────────────────────────────────────────────────────────────
// Config ligera
// ─────────────────────────────────────────────────────────────────────────────
const RETRY   = Math.max(0, Number(process.env.HEALTH_RETRY || 1));
const TIMEOUT = Number(process.env.HEALTH_TIMEOUT_MS || 1200);

// Ventana de métricas en memoria (no persistente)
const HIST_WINDOW = Math.max(5, Number(process.env.HEALTH_HIST_WINDOW || 20));
const _HIST = new Map(); // name -> [{ ms:number|null, status:'OK'|'DEGRADED'|'DOWN'|'CONFIG' }...]

function _pushHist(name, { latency_ms, status }) {
  const arr = _HIST.get(name) || [];
  arr.push({ ms: (typeof latency_ms === 'number' ? latency_ms : null), status });
  while (arr.length > HIST_WINDOW) arr.shift();
  _HIST.set(name, arr);
}
function _stats(name) {
  const arr = _HIST.get(name) || [];
  const vals = arr.map(x => x.ms).filter(v => typeof v === 'number').sort((a,b)=>a-b);
  const bads = arr.filter(x => x.status === 'DOWN').length;
  const all  = arr.length || 1;
  const p = (q) => {
    if (!vals.length) return null;
    const idx = Math.min(vals.length - 1, Math.floor((q / 100) * (vals.length - 1)));
    return Math.round(vals[idx]);
  };
  return {
    p50_ms: vals.length ? p(50) : null,
    p95_ms: vals.length ? p(95) : null,
    timeout_pct: Math.round((bads / all) * 100),
  };
}

// Wrapper con retry y backoff corto
async function withRetry(fn) {
  let last;
  for (let i = 0; i <= RETRY; i++) {
    try { return await fn(); }
    catch (e) { last = e; if (i < RETRY) await sleep(100 + Math.random() * 120); }
  }
  throw last;
}

// ───────── Infra ─────────
export async function checkTelegramMode() {
  const webhook = !!process.env.TG_WEBHOOK_URL || !!process.env.WEBHOOK_URL;
  return { name: 'TG mode', group: 'infra', label: webhook ? 'WEBHOOK' : 'POLLING', status: 'OK' };
}

export async function checkQuickNode() {
  const url = process.env.QUICKNODE_URL;
  if (!url) return { name: 'QuickNode', group: 'infra', status: 'CONFIG' };
  try {
    const r = await withRetry(() => postJson(url, { jsonrpc: '2.0', id: 1, method: 'getSlot' }, TIMEOUT));
    const status = r.ok ? 'OK' : (r.status === 429 || r.status === 401 ? 'DEGRADED' : 'DOWN');
    return { name: 'QuickNode', group: 'infra', status, latency_ms: r.dt, http: r.status };
  } catch (e) {
    return { name: 'QuickNode', group: 'infra', status: 'DOWN', reason: String(e?.message || e) };
  }
}

export async function checkPhantom() {
  const addr = process.env.PHANTOM_PUBLIC_KEY || process.env.PHANTOM_ADDRESS;
  return { name: 'Phantom', group: 'infra', status: addr ? 'OK' : 'CONFIG' };
}

export async function checkSheets() {
  const id = process.env.GOOGLE_SHEETS_ID;
  return { name: 'Google Sheets', group: 'infra', status: id ? 'OK' : 'CONFIG' };
}

export async function checkRender() {
  // En Render agregá ENV RENDER=1 (o usa RENDER_SERVICE_ID / RENDER)
  const on = process.env.RENDER || process.env.RENDER_SERVICE_ID || '';
  return { name: 'Render', group: 'infra', status: on ? 'OK' : 'DOWN' };
}

// ───────── Data sources ─────────
export async function checkDexscreener() {
  try {
    const r = await withRetry(() =>
      getJson('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112', TIMEOUT)
    );
    const status = r.ok ? 'OK' : 'DOWN';
    return { name: 'DexScreener', group: 'data', status, latency_ms: r.dt, http: r.status };
  } catch (e) {
    return { name: 'DexScreener', group: 'data', status: 'DOWN', reason: String(e?.message || e) };
  }
}

export async function checkBirdeye() {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return { name: 'Birdeye', group: 'data', status: 'CONFIG' };
  try {
    // Precio de SOL en Birdeye (endpoint público por plan)
    const url = 'https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112&chain=solana';
    const r = await withRetry(() => getJson(url, TIMEOUT, { 'X-API-KEY': key, accept: 'application/json' }));
    const status = r.ok ? 'OK' : (r.status === 429 || r.status === 401 ? 'DEGRADED' : 'DOWN');
    return { name: 'Birdeye', group: 'data', status, latency_ms: r.dt, http: r.status };
  } catch (e) {
    return { name: 'Birdeye', group: 'data', status: 'DOWN', reason: String(e?.message || e) };
  }
}

export async function checkTokenSniffer() {
  // Generalmente no cubre Solana; si tenés key Pro, podrías integrar señal mínima
  const key = process.env.TOKENSNIFFER_API_KEY || '';
  return { name: 'TokenSniffer', group: 'data', status: key ? 'CONFIG' : 'CONFIG' };
}

export async function checkGoPlus() {
  const key = process.env.GOPLUS_API_KEY;
  if (!key) return { name: 'GoPlus', group: 'data', status: 'CONFIG' };
  try {
    const url = (process.env.GOPLUS_PING_URL || 'https://api.gopluslabs.io/api/v1/chain_list') + '?api_key=' + encodeURIComponent(key);
    const r = await withRetry(() => getJson(url, TIMEOUT));
    const status = r.ok ? 'OK' : (r.status === 429 || r.status === 401 ? 'DEGRADED' : 'DOWN');
    return { name: 'GoPlus', group: 'data', status, latency_ms: r.dt, http: r.status };
  } catch (e) {
    return { name: 'GoPlus', group: 'data', status: 'DOWN', reason: String(e?.message || e) };
  }
}

export async function checkWhaleAlert() {
  const key = process.env.WHALE_ALERT_API_KEY;
  if (!key) return { name: 'Whale Alert', group: 'data', status: 'CONFIG' };
  try {
    const r = await withRetry(() => getJson('https://api.whale-alert.io/v1/status?api_key=' + encodeURIComponent(key), TIMEOUT));
    const status = r.ok ? 'OK' : (r.status === 429 || r.status === 401 ? 'DEGRADED' : 'DOWN');
    return { name: 'Whale Alert', group: 'data', status, latency_ms: r.dt, http: r.status };
  } catch (e) {
    return { name: 'Whale Alert', group: 'data', status: 'DOWN', reason: String(e?.message || e) };
  }
}

export async function checkTensorflow() {
  // Señal mínima: si tfjs carga, marcamos OK (solo disponibilidad de lib)
  try {
    await withRetry(() => import('@tensorflow/tfjs'));
    return { name: 'TensorFlow IA', group: 'data', status: 'OK' };
  } catch {
    return { name: 'TensorFlow IA', group: 'data', status: 'CONFIG' };
  }
}

export async function checkSolscan() {
  try {
    const r = await withRetry(() => getJson('https://api.solscan.io/chaininfo', TIMEOUT));
    const status = r.ok ? 'OK' : 'DOWN';
    return { name: 'Solscan', group: 'data', status, latency_ms: r.dt, http: r.status };
  } catch (e) {
    return { name: 'Solscan', group: 'data', status: 'DOWN', reason: String(e?.message || e) };
  }
}

export async function checkJupiter() {
  try {
    const r = await withRetry(() => getJson('https://price.jup.ag/v4/price?ids=SOL', TIMEOUT));
    const status = r.ok ? 'OK' : 'DOWN';
    return { name: 'Jupiter', group: 'data', status, latency_ms: r.dt, http: r.status };
  } catch (e) {
    return { name: 'Jupiter', group: 'data', status: 'DOWN', reason: String(e?.message || e) };
  }
}

export async function checkRaydium() {
  try {
    const r = await withRetry(() => getJson('https://api.raydium.io/pairs?limit=1', TIMEOUT));
    const status = r.ok ? 'OK' : 'DOWN';
    return { name: 'Raydium', group: 'data', status, latency_ms: r.dt, http: r.status };
  } catch (e) {
    return { name: 'Raydium', group: 'data', status: 'DOWN', reason: String(e?.message || e) };
  }
}

export async function checkCoingecko() {
  try {
    const r = await withRetry(() => getJson('https://api.coingecko.com/api/v3/ping', TIMEOUT));
    const status = r.ok ? 'OK' : 'DOWN';
    return { name: 'CoinGecko', group: 'data', status, latency_ms: r.dt, http: r.status };
  } catch (e) {
    return { name: 'CoinGecko', group: 'data', status: 'DOWN', reason: String(e?.message || e) };
  }
}

export async function checkCMC() {
  const key = process.env.CMC_API_KEY;
  if (!key) return { name: 'CoinMarketCap', group: 'data', status: 'CONFIG' };
  try {
    const r = await withRetry(() =>
      getJson('https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?limit=1', TIMEOUT, { 'X-CMC_PRO_API_KEY': key })
    );
    const status = r.ok ? 'OK' : (r.status === 429 || r.status === 401 ? 'DEGRADED' : 'DOWN');
    return { name: 'CoinMarketCap', group: 'data', status, latency_ms: r.dt, http: r.status };
  } catch (e) {
    return { name: 'CoinMarketCap', group: 'data', status: 'DOWN', reason: String(e?.message || e) };
  }
}

export async function checkDiscord() {
  const wh = process.env.DISCORD_WEBHOOK_URL;
  return { name: 'Discord', group: 'data', status: wh ? 'OK' : 'CONFIG' };
}

// ───────── Agregador + enriquecimiento de métricas ─────────
export async function runAllChecks() {
  const checks = [
    // Infra
    checkTelegramMode, checkQuickNode, checkPhantom, checkSheets, checkRender,
    // Data
    checkDexscreener, checkBirdeye, checkTokenSniffer, checkGoPlus, checkWhaleAlert,
    checkTensorflow, checkSolscan, checkJupiter, checkRaydium, checkCoingecko, checkCMC, checkDiscord
  ];

  const results = [];
  for (const fn of checks) {
    let r;
    try { r = await fn(); }
    catch (e) { r = { name: fn.name, status: 'DOWN', reason: String(e?.message || e) }; }
    // Guardar en historial y enriquecer con p50/p95/timeout%
    _pushHist(r.name, r);
    const st = _stats(r.name);
    results.push({ ...r, ...st });
  }
  return results;
}

// Resumen en texto (Markdown simple) para /health (Telegram o Notion)
export function formatSummary(results) {
  const toIcon = (s) =>
    s === 'OK' ? '✅' : s === 'DEGRADED' ? '🟠' : s === 'CONFIG' || s === 'SKIPPED' ? '➖' : '❌';

  const infra = results.filter(r => r.group === 'infra');
  const data  = results.filter(r => r.group === 'data');

  // Score: sólo servicios evaluables (OK/DOWN/DEGRADED)
  const evals = results.filter(r => ['OK', 'DOWN', 'DEGRADED'].includes(r.status));
  const got   = evals.reduce((a, r) => a + scoreFrom(r.status, r.latency_ms), 0);
  const den   = evals.length || 1;
  const pct   = got / den;
  const sem   = (pct >= 0.90) ? '🟢' : (pct >= 0.60) ? '🟡' : '🔴';

  const line = (r) => {
    const base = `• ${r.name}: ${toIcon(r.status)}`;
    const extra = [];
    if (r.label) extra.push(r.label);
    if (typeof r.latency_ms === 'number') extra.push(`${r.latency_ms}ms`);
    if (typeof r.p95_ms === 'number') extra.push(`p95=${r.p95_ms}ms`);
    if (typeof r.timeout_pct === 'number') extra.push(`to=${r.timeout_pct}%`);
    if (typeof r.http === 'number') extra.push(`HTTP ${r.http}`);
    if (r.reason && r.status !== 'OK') extra.push(r.reason);
    return extra.length ? `${base} (${extra.join(' · ')})` : base;
  };

  const infraTxt = infra.map(line).join('\n');
  const dataTxt  = data.map(line).join('\n');

  const header =
    `**🛰️ Conexiones activas**\n\n` +
    `Semáforo global: ${sem}  • Score: ${got.toFixed(1)}/${den} (${Math.round(pct * 100)}%)\n\n` +
    `**Infraestructura**\n${infraTxt}\n\n` +
    `**Fuentes de datos**\n${dataTxt}`;

  return header;
}
