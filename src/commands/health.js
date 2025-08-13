// src/commands/health.js — Health “vivo” con auto-refresh adaptativo (HTML)

const OK  = '✅';
const BAD = '❌';

// Escapar HTML (por si acaso)
function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));

// fetch con timeout corto
async function ping(url, { method='GET', headers={}, body, timeoutMs=2500 } = {}) {
  try {
    const res = await fetch(url, { method, headers, body, signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/** ---------- PROBES ---------- **/

async function checkQuickNode() {
  const url = process.env.QUICKNODE_HTTP || process.env.QUICKNODE_RPC_URL || process.env.RPC_URL || process.env.QUICKNODE_URL;
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type':'application/json' },
      body: JSON.stringify({ jsonrpc:'2.0', id:1, method:'getHealth' }),
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const j = await res.json().catch(()=>null);
    return j?.result === 'ok' || j !== null;
  } catch {
    return false;
  }
}

async function checkPhantomStr() {
  // Devolvemos una cadena lista para mostrar: "✅ (X.XXXX SOL)" o "❌"
  try {
    const addr = process.env.PHANTOM_ADDRESS || '';
    // import dinámico para no romper si falta el módulo
    const sol = await import('../services/solana.js').catch(()=>null);
    if (!sol || typeof sol.isValidSolAddress !== 'function' || typeof sol.getSolBalance !== 'function') {
      return BAD;
    }
    if (!sol.isValidSolAddress(addr)) return BAD;
    const bal = await sol.getSolBalance(addr).catch(()=>null);
    if (bal == null) return BAD;
    return `${OK} (${bal.toFixed(4)} SOL)`;
  } catch { return BAD; }
}

async function checkSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return false;
  return ping(`${url.replace(/\/+$/,'')}/auth/v1/health`, { headers: { apikey: key }, timeoutMs: 2500 });
}

async function checkSheets() {
  const id  = process.env.GOOGLE_SHEETS_ID || process.env.SHEETS_ID || process.env.GSHEET_ID;
  const svc = (process.env.GOOGLE_SA_JSON_PATH || process.env.GOOGLE_SA_JSON ||
               (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY));
  return !!(id && svc);
}

async function checkRender() { return !!(process.env.RENDER || process.env.RENDER_EXTERNAL_URL); }

// Fuentes de datos
async function checkDexScreener(){ return ping('https://api.dexscreener.com/latest/dex/search?q=sol', { timeoutMs: 2500 }); }
async function checkBirdeye(){
  const key = process.env.BIRDEYE_API_KEY || process.env.BIRD_EYE_API_KEY;
  if (!key) return false;
  return ping('https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112',
              { headers: { 'X-API-KEY': key }, timeoutMs: 2500 });
}
async function checkTokenSniffer(){ return ping('https://tokensniffer.com', { timeoutMs: 2500 }); }
async function checkWhaleAlert(){
  const key = process.env.WHALE_ALERT_API_KEY || process.env.WHALEALERT_API_KEY;
  if (!key) return false;
  return ping(`https://api.whale-alert.io/v1/status?api_key=${encodeURIComponent(key)}`, { timeoutMs: 2500 });
}
async function checkTF(){
  try {
    const tf = await import('@tensorflow/tfjs-node').catch(()=>null) || await import('@tensorflow/tfjs').catch(()=>null);
    return !!tf;
  } catch { return false; }
}
async function checkSolscan(){ return ping('https://public-api.solscan.io/chaininfo', { timeoutMs: 2500 }); }
async function checkJupiter(){ return ping('https://price.jup.ag/v4/price?ids=SOL', { timeoutMs: 2500 }); }
async function checkRaydium(){ return ping('https://api.raydium.io/pairs', { timeoutMs: 2500 }); }
async function checkCoinGecko(){ return ping('https://api.coingecko.com/api/v3/ping', { timeoutMs: 2500 }); }
async function checkCMC(){
  const key = process.env.CMC_API_KEY || process.env.COINMARKETCAP_API_KEY;
  if (!key) return false;
  return ping('https://pro-api.coinmarketcap.com/v1/key/info', { headers: { 'X-CMC_PRO_API_KEY': key }, timeoutMs: 2500 });
}
async function checkDiscord(){ return !!process.env.DISCORD_TOKEN; }

/** ---------- RENDER ---------- **/

async function snapshot(bot){
  const tgMode = 'POLLING';

  const [ qn, phStr, sb, sh, rn,
          ds, be, ts, wa, tf,
          ss, jp, ry, cg, cmc, dc ] = await Promise.all([
    checkQuickNode(),
    checkPhantomStr(),
    checkSupabase(),
    checkSheets(),
    checkRender(),

    checkDexScreener(),
    checkBirdeye(),
    checkTokenSniffer(),
    checkWhaleAlert(),
    checkTF(),

    checkSolscan(),
    checkJupiter(),
    checkRaydium(),
    checkCoinGecko(),
    checkCMC(),
    checkDiscord(),
  ]);

  const b = (v)=> v ? OK : BAD;

  const infra = [
    '<b>Infraestructura</b>',
    '<pre>',
    `• TG mode: ${tgMode}`,
    `• QuickNode: ${b(qn)}`,
    `• Phantom: ${phStr}`,
    `• Google Sheets: ${b(sh)}`,
    `• Render: ${b(rn)}`,
    '</pre>',
  ].join('\n');

  const data = [
    '<b>Fuentes de datos</b>',
    '<pre>',
    `• DexScreener: ${b(ds)}`,
    `• Birdeye: ${b(be)}`,
    `• TokenSniffer: ${b(ts)}`,
    `• Whale Alert: ${b(wa)}`,
    `• TensorFlow IA: ${b(tf)}`,
    `• Solscan: ${b(ss)}`,
    `• Jupiter: ${b(jp)}`,
    `• Raydium: ${b(ry)}`,
    `• CoinGecko: ${b(cg)}`,
    `• CoinMarketCap: ${b(cmc)}`,
    `• Discord: ${b(dc)}`,
    '</pre>',
  ].join('\n');

  const header = '<b>🛰️ Conexiones activas</b>';
  return [header, infra, data].join('\n');
}

function jitter(ms){ return Math.max(500, Math.round(ms * (0.90 + Math.random()*0.2))); }
function nextDelay({ prevMs, changed, errorCount, baseMs }){
  if (errorCount>0) return Math.min(60000, Math.max(baseMs, prevMs*1.5));
  if (changed)      return Math.max(baseMs, Math.floor(prevMs*0.85));
  return Math.min(60000, Math.floor(prevMs*1.15));
}

/** ---------- REGISTRO COMANDO ---------- **/

export default function registerHealth(bot){
  bot._healthState = bot._healthState || {}; // por uid

  // /health [seg] | /health once | /health stop
  bot.removeTextListener?.(/^\/health(?:@[\w_]+)?/i);
  bot.onText(/^\/health(?:@[\w_]+)?(?:\s+(stop|once|\d+))?\s*$/i, async (msg, m) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);
    const arg    = (m[1]||'').toLowerCase().trim();

    if (arg === 'stop') {
      const st = bot._healthState[uid];
      if (st?.timer) { clearTimeout(st.timer); st.timer=null; }
      return bot.sendMessage(chatId, '⏹️ Auto-refresh detenido.', { parse_mode:'HTML' });
    }

    const once   = (arg === 'once');
    const baseMs = Math.max(2000, Math.min(30000, (Number(arg)||10)*1000));

    // cancel loop previo si existía
    const stPrev = bot._healthState[uid];
    if (stPrev?.timer) { clearTimeout(stPrev.timer); stPrev.timer=null; }

    const st = bot._healthState[uid] = { timer:null, running:false, prevText:'', delayMs: baseMs, errors:0 };

    const first = await snapshot(bot);
    const replyMarkup = once ? undefined : {
      inline_keyboard: [[
        { text: `🔄 base ${Math.round(baseMs/1000)}s`, callback_data: 'health:noop' },
        { text: '⏹️ Parar', callback_data: 'health:stop' },
      ]]
    };
    const sent = await bot.sendMessage(chatId, first, { parse_mode:'HTML', reply_markup: replyMarkup });
    st.prevText = first;

    if (once) return;

    const tick = async () => {
      if (st.running) { st.timer = setTimeout(tick, jitter(1000)); return; }
      st.running = true;
      let changed = false;
      try {
        const fresh = await snapshot(bot);
        if (fresh !== st.prevText) {
          await bot.editMessageText(fresh, { chat_id: chatId, message_id: sent.message_id, parse_mode:'HTML', reply_markup: replyMarkup });
          st.prevText = fresh;
          changed = true;
        }
        st.errors = 0;
      } catch {
        st.errors = Math.min(st.errors + 1, 10);
      } finally {
        st.running = false;
      }
      st.delayMs = nextDelay({ prevMs: st.delayMs, changed, errorCount: st.errors, baseMs });
      st.timer   = setTimeout(tick, st.delayMs);
    };

    st.timer = setTimeout(tick, st.delayMs);
  });

  // Botones (parar / no-op)
  bot.on('callback_query', async (q) => {
    const data = q.data || '';
    if (!/^health:/.test(data)) return;
    const uid = String(q.from.id);
    const st  = bot._healthState?.[uid];
    if (data === 'health:stop') {
      if (st?.timer) { clearTimeout(st.timer); st.timer=null; }
      try { await bot.answerCallbackQuery(q.id, { text: 'Auto-refresh detenido.' }); } catch {}
    } else {
      try { await bot.answerCallbackQuery(q.id); } catch {}
    }
  });

  console.log('✅ Handler cargado: health.js (live/adaptativo)');
}
