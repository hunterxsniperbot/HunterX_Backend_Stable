// src/commands/health.js — /health con checklist de infraestructura y fuentes
import fetch from 'node-fetch';

// util: timeout corto para que no se “cuelgue”
const TOUT = 5000;
const ok  = '✅';
const bad = '❌';
const na  = '—';

// ping HTTP genérico
async function ping(url, opts = {}) {
  try {
    const r = await fetch(url, { timeout: TOUT, ...opts });
    return r.ok || (r.status >= 200 && r.status < 500); // 4xx también indica reachability
  } catch {
    return false;
  }
}

// RPC a QuickNode (light)
async function pingQuickNode() {
  const rpc = process.env.QUICKNODE_RPC_URL;
  if (!rpc) return false;
  try {
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'getSlot',   // baratísimo
      params: [{ commitment: 'processed' }]
    };
    const r = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      timeout: TOUT
    });
    const j = await r.json().catch(()=>null);
    return Number.isFinite(j?.result);
  } catch {
    return false;
  }
}

// “pings” de fuentes públicas
async function pingDexScreener() { return ping('https://api.dexscreener.com/latest/dex/search?q=SOL'); }
async function pingJupiter()     { return ping('https://price.jup.ag/v6/price?ids=SOL'); }
async function pingRaydium()     { return ping('https://api.raydium.io/pairs'); }
async function pingCoinGecko()   { return ping('https://api.coingecko.com/api/v3/ping'); }
async function pingSolscan()     { return ping('https://public-api.solscan.io/chaininfo'); }

// wrappers opcionales a tus clientes
async function pingSupabase(supabaseClient) {
  // si tenés helper ping, usalo; si no, probá REST simple
  try {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) return false;
    const url = process.env.SUPABASE_URL.replace(/\/+$/,'') + '/rest/v1/?apikey=' + process.env.SUPABASE_KEY;
    return ping(url);
  } catch { return false; }
}

async function pingSheets(sheetsClient) {
  try {
    const tabDemo = process.env.SHEETS_TAB_DEMO || 'DEMO';
    // ensureHeaderRow no rompe: si ya existe, no cambia nada
    await sheetsClient.ensureHeaderRow(tabDemo);
    return true;
  } catch { return false; }
}

async function pingPhantom(phantomClient) {
  try {
    // “salud” mínima: si existen buy/sell funcs y (opcional) tenemos address pública
    const hasFns = typeof phantomClient?.buyToken === 'function' && typeof phantomClient?.sellToken === 'function';
    const hasAddr = !!process.env.PHANTOM_PUBLIC_ADDRESS;
    return hasFns && hasAddr;
  } catch { return false; }
}

export default function registerHealth(bot, { supabaseClient, sheetsClient, quickNodeClient, phantomClient }) {
  bot.onText(/^\/health$/, async (msg) => {
    const chatId = msg.chat.id;

    // Infraestructura
    const tgMode = (process.env.TG_MODE || 'polling').toUpperCase();
    const isQN   = await pingQuickNode();
    const isPh   = await pingPhantom(phantomClient);
    const isSb   = await pingSupabase(supabaseClient);
    const isGs   = await pingSheets(sheetsClient);
    const isRnd  = !!process.env.RENDER; // marcarás RENDER=1 cuando lo subas

    // Fuentes
    const [isDex, isBird, isTok, isWhale, isTF, isSol, isJup, isRay, isCg, isCmc, isDisc] = await Promise.all([
      pingDexScreener(),
      Promise.resolve(!!process.env.BIRDEYE_API_KEY),      // requerirá key; acá solo validamos presencia
      Promise.resolve(false),                               // TokenSniffer sin key → por ahora ❌
      Promise.resolve(!!process.env.WHALE_ALERT_KEY),       // key presente = tentativo OK
      Promise.resolve(!!process.env.TF_MODEL_URL),          // si tenés endpoint de tu IA
      pingSolscan(),
      pingJupiter(),
      pingRaydium(),
      pingCoinGecko(),
      Promise.resolve(!!process.env.CMC_API_KEY),
      Promise.resolve(!!process.env.DISCORD_BOT_TOKEN || !!process.env.DISCORD_WEBHOOK)
    ]);

    const txt =
`🛰️ *Conexiones activas*

*Infraestructura*
• TG mode: *${tgMode}*
• QuickNode: ${isQN ? ok : bad}
• Phantom: ${isPh ? ok : bad}
• Supabase: ${isSb ? ok : bad}
• Google Sheets: ${isGs ? ok : bad}
• Render: ${isRnd ? ok : bad}

*Fuentes de datos*
• DexScreener: ${isDex ? ok : bad}
• Birdeye: ${isBird ? ok : bad}
• TokenSniffer: ${isTok ? ok : bad}
• Whale Alert: ${isWhale ? ok : bad}
• TensorFlow IA: ${isTF ? ok : bad}
• Solscan: ${isSol ? ok : bad}
• Jupiter: ${isJup ? ok : bad}
• Raydium: ${isRay ? ok : bad}
• CoinGecko: ${isCg ? ok : bad}
• CoinMarketCap: ${isCmc ? ok : bad}
• Discord: ${isDisc ? ok : bad}`;

    await bot.sendMessage(chatId, txt, { parse_mode: 'Markdown' });
  });
}
