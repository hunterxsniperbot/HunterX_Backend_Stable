/* 
 * HUNTER X — /salud | Conexiones activas — HX-A02 v2025-09-14
 * Purpose: Resumen de proveedores/infra con score, auto-refresh y toggles.
 * Inputs:  API /api/salud (si disponible), HEAD/GET locales como fallback
 * Outputs: Mensaje Telegram (Markdown) con score y notas por proveedor
 * Deps:    boot/health_checks.js (formatSummary) opcional
 * ENV:     SALUD_REFRESH_MS, API_PORT, HX_DEFAULT_MODE
 * Invariants: Nunca crashea; ignora 'message is not modified'; no penaliza proveedores deshabilitados
 * Notes:   Auto-documentado; mantener esta cabecera al día.
 */
// ─────────────────────────────────────────────────────────────────────────────
// HUNTERX — /salud | Conexiones activas — HX-A02 — v2025-09-10 (ESM)
// - UI: mensaje único con botones [Refrescar] y [AUTO ON/OFF]
// - Anti-flicker: no edita si no cambió (hash) y silencia "message is not modified"
// - Providers deshabilitados: se listan sin penalizar el score
// - GoPlus / CMC usan headers si hay claves en .env
// - Jupiter usa v6: https://price.jup.ag/v6/price?ids=SOL
// ENV útiles (opcionales):
//   USE_HELIUS, USE_QUICKNODE, USE_PHANTOM, USE_SHEETS, USE_SUPABASE, USE_REDIS
//   USE_DEXSCREENER, USE_GOPLUS, USE_JUPITER, USE_RAYDIUM, USE_COINGECKO, USE_CMC
//   USE_BIRDEYE, USE_WHALE_ALERT, USE_TOKEN_SNIFFER
//   SALUD_REFRESH_MS (default 12000)
//   API_PORT (si más adelante usás /api/salud)
// ─────────────────────────────────────────────────────────────────────────────

const EMO = {
  ok: '🟢', warn: '🟡', err: '🔴', head: '🛰️', infra: '🏗️', data: '📚',
  refresh:'🔄', autoOn:'🟢 AUTO', autoOff:'⚪ AUTO'
};

const REFRESH_MS = Number(process.env.SALUD_REFRESH_MS || 12000);
const API_PORT   = Number(process.env.API_PORT || 3000);
const SLOTS = new Map(); // chatId -> { msgId, auto, timer, busy, lastHash }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers genéricos
// ─────────────────────────────────────────────────────────────────────────────
function scoreToLight(s){ return s >= 85 ? EMO.ok : s >= 60 ? EMO.warn : EMO.err; }
function tzLabel(){
  try { return process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
}
function hash(s){
  let h=0; for (let i=0;i<s.length;i++) { h=((h<<5)-h)+s.charCodeAt(i); h|=0; }
  return String(h);
}
function trimForTelegram(text, maxLen = 3800) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen - 20) + '\n\n…(recortado)';
}
function isOn(key, def=1){
  const v = process.env[key];
  if (v == null) return !!def;
  return /^(1|true|yes|on)$/i.test(String(v).trim());
}
function modeLabel(){
  // Si tu proyecto guarda modo por chat, podés adaptar. Aquí: env fallback
  const m = (process.env.HX_MODE || process.env.DEFAULT_MODE || 'DEMO').toUpperCase();
  return (m === 'REAL') ? 'REAL' : 'DEMO';
}

async function fetchJson(url, { timeoutMs=2500, headers={}, method='GET', body=null } = {}) {
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
  try{
    const r = await fetch(url, { method, headers, body, signal: ac.signal });
    let json=null, err=null;
    try { json = await r.json(); } catch(e){ err=String(e?.message||e); }
    return { ok:r.ok, status:r.status, json, error:err };
  }catch(e){
    return { ok:false, status:null, json:null, error:String(e?.message||e) };
  }finally{ clearTimeout(t); }
}

async function safeEdit(bot, chatId, messageId, text, kb){
  try{
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: kb,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    return true;
  }catch(e1){
    const msg = String(e1?.response?.body?.description || e1?.message || e1);
    if (msg.includes('message is not modified')) return false;
    try{
      await bot.editMessageText(text.replace(/\*/g,''), {
        chat_id: chatId,
        message_id: messageId,
        reply_markup: kb,
        disable_web_page_preview: true
      });
      return true;
    }catch(e2){
      const msg2 = String(e2?.response?.body?.description || e2?.message || e2);
      if (msg2.includes('message is not modified')) return false;
      return false;
    }
  }
}

async function safeSend(bot, chatId, text, kb){
  try{
    const m = await bot.sendMessage(chatId, text, {
      reply_markup: kb,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    return m?.message_id;
  }catch{
    const m = await bot.sendMessage(chatId, text.replace(/\*/g,''), {
      reply_markup: kb,
      disable_web_page_preview: true
    });
    return m?.message_id;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Checks específicos
// ─────────────────────────────────────────────────────────────────────────────
async function checkHelius(){
  if (!isOn('USE_HELIUS', 1)) return null;
  const url = process.env.HELIUS_RPC_URL;
  if (!url) return {name:"Helius", ok:false, score:0, note:"sin HELIUS_RPC_URL"};
  try{
    const ac = new AbortController();
    const t = setTimeout(()=>ac.abort('timeout'), 2500);
    const r = await fetch(url, {
      method:"POST",
      headers:{"content-type":"application/json"},
      body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getSlot"}),
      signal: ac.signal
    });
    clearTimeout(t);
    return {name:"Helius", ok:r.ok, score:r.ok?95:0, note:r.ok?"RPC OK":("HTTP "+r.status)};
  }catch(e){ return {name:"Helius", ok:false, score:0, note:String(e?.message||e)} }
}

async function checkQuickNode(){
  if (!isOn('USE_QUICKNODE', 1)) return null;
  const url = process.env.QUICKNODE_URL;
  if (!url) return {name:"QuickNode", ok:false, score:0, note:"sin QUICKNODE_URL"};
  try{
    const ac = new AbortController();
    const t = setTimeout(()=>ac.abort('timeout'), 2500);
    const r = await fetch(url, {
      method:"POST",
      headers:{"content-type":"application/json"},
      body: JSON.stringify({jsonrpc:"2.0",id:1,method:"getSlot"}),
      signal: ac.signal
    });
    clearTimeout(t);
    return {name:"QuickNode", ok:r.ok, score:r.ok?95:0, note:r.ok?"RPC OK":("HTTP "+r.status)};
  }catch(e){ return {name:"QuickNode", ok:false, score:0, note:String(e?.message||e)} }
}

async function checkSheets(){
  if (!isOn('USE_SHEETS', 1)) return null;
  const hasId = !!process.env.GOOGLE_SHEETS_ID;
  return {name:"Google Sheets", ok:hasId, score:hasId?90:0, note:hasId?"Hoja de operaciones":"sin GOOGLE_SHEETS_ID"};
}

async function checkSupabase(){
  if (!isOn('USE_SUPABASE', 1)) return null;
  const base = process.env.SUPABASE_URL, key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!base || !key) return {name:"Supabase", ok:false, score:0, note:"faltan URL/key"};
  const r = await fetchJson(`${base}/rest/v1/`, { timeoutMs:2000, headers:{apikey:key,Authorization:`Bearer ${key}`} });
  return { name:"Supabase", ok:r.ok, score:r.ok?95:0, note:r.ok?"Base de datos":"HTTP "+(r.status||"") };
}

async function checkRedis(){
  if (!isOn('USE_REDIS', 1)) return null;
  const has = !!(process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL);
  return { name:"Redis", ok:has, score:has?95:0, note: has?"cache":"sin URL" };
}

// Datos
async function checkHTTP(name, url, headers={}, timeoutMs=2500){
  const r = await fetchJson(url, { timeoutMs, headers });
  const ok = r.ok;
  const score = ok ? 90 : 0;
  const note = ok ? `HTTP ${r.status}` : (r.error || ('HTTP '+(r.status||'fail')));
  return { name, ok, score, note };
}

async function checkDexScreener(){
  if (!isOn('USE_DEXSCREENER', 1)) return null;
  return checkHTTP('DexScreener', 'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112');
}
async function checkGoPlus(){
  if (!isOn('USE_GOPLUS', 1)) return null;
  const key = process.env.GOPLUS_API_KEY || process.env.GOPLUS_KEY;
  if (!key) return {name:"GoPlus", ok:false, score:0, note:"sin GOPLUS_API_KEY"};
  const headers = { 'Content-Type':'application/json', 'API-KEY': key };
  // endpoint liviano de prueba
  const url = 'https://api.gopluslabs.io/api/v1/token_security/sol?contract_addresses=So11111111111111111111111111111111111111112';
  return checkHTTP('GoPlus', url, headers);
}
async function checkJupiter(){
  if (!isOn('USE_JUPITER', 1)) return null;
  return checkHTTP('Jupiter', 'https://price.jup.ag/v6/price?ids=SOL');
}
async function checkRaydium(){
  if (!isOn('USE_RAYDIUM', 1)) return null;
  return checkHTTP('Raydium', 'https://api.raydium.io/pairs?limit=1');
}
async function checkCoinGecko(){
  if (!isOn('USE_COINGECKO', 1)) return null;
  return checkHTTP('CoinGecko', 'https://api.coingecko.com/api/v3/ping');
}
async function checkCMC(){
  if (!isOn('USE_CMC', 0)) return null;
  const key = process.env.CMC_PRO_API_KEY || process.env.CMC_API_KEY;
  if (!key) return {name:"CoinMarketCap", ok:false, score:0, note:"sin CMC_API_KEY"};
  const headers = { 'X-CMC_PRO_API_KEY': key };
  return checkHTTP('CoinMarketCap', 'https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?limit=1', headers);
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot local (robusto) — lista habilitados y acumula deshabilitados
// ─────────────────────────────────────────────────────────────────────────────
async function snapshot(){
  const infra = [], data = [], skipped = [];

  // Infra
  infra.push({name:'TG mode', ok:true, score:100, note:'POLLING'});
  const h = await checkHelius();     if (h) infra.push(h); else skipped.push('Helius');
  const q = await checkQuickNode();  if (q) infra.push(q); else skipped.push('QuickNode');

  if (isOn('USE_PHANTOM', 0)) {
    const hasPh = !!(process.env.PHANTOM_PK || process.env.PHANTOM_PUBLIC_KEY || process.env.PHANTOM_ADDRESS);
    infra.push({name:'Phantom', ok:hasPh, score: hasPh?80:0, note: hasPh?'clave presente':'sin clave'});
  } else skipped.push('Phantom');

  const sh = await checkSheets();    if (sh) infra.push(sh); else skipped.push('Google Sheets');
  const su = await checkSupabase();  if (su) infra.push(su); else skipped.push('Supabase');

  if (isOn('USE_RENDER', 0)) {
    const onRender = !!process.env.RENDER;
    infra.push({name:'Render', ok:onRender, score:onRender?60:0, note:onRender?'configurado':'local'});
  } else skipped.push('Render');

  const rd = await checkRedis();     if (rd) infra.push(rd); else skipped.push('Redis');

  // Datos
  const dx = await checkDexScreener();  if (dx) data.push(dx); else skipped.push('DexScreener');
  const gp = await checkGoPlus();       if (gp) data.push(gp); else skipped.push('GoPlus');
  const jp = await checkJupiter();      if (jp) data.push(jp); else skipped.push('Jupiter');
  const ry = await checkRaydium();      if (ry) data.push(ry); else skipped.push('Raydium');
  const cg = await checkCoinGecko();    if (cg) data.push(cg); else skipped.push('CoinGecko');
  const cm = await checkCMC();          if (cm) data.push(cm); else skipped.push('CoinMarketCap');

  if (!isOn('USE_BIRDEYE', 0)) skipped.push('Birdeye');
  if (!isOn('USE_WHALE_ALERT', 0)) skipped.push('Whale Alert');
  if (!isOn('USE_TOKEN_SNIFFER', 0)) skipped.push('TokenSniffer');

  // Score global (solo habilitados)
  const all = [...infra, ...data];
  const enabled = all.filter(x => x && typeof x.score === 'number');
  const avg = Math.round(enabled.reduce((a,x)=>a+(x.score||0),0) / Math.max(1, enabled.length));

  const line = (x)=>{
    const light = scoreToLight(x.score||0);
    const score = (x.score||0).toString().padStart(2,' ');
    return `• ${x.name}: ${light} (${score}) - ${x.note||''}`;
  };

  const mode = modeLabel();
  const head  = `**${EMO.head} Conexiones activas** — Modo: ${mode} (${tzLabel()})`;
  const infraTxt = `**${EMO.infra} Infraestructura**\n` + infra.map(line).join('\n');
  const dataTxt  = `**${EMO.data} Fuentes de datos**\n` + data.map(line).join('\n');
  const skTxt = skipped.length ? ("\nDeshabilitados (no puntúan): " + skipped.join(", ")) : "";
  const global= `\nScore global: ${scoreToLight(avg)} ${avg}/100`;
  return [head, infraTxt, dataTxt + skTxt, global].join("\n\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Render principal + scheduling
// ─────────────────────────────────────────────────────────────────────────────
function buildKb(slot){
  return {
    inline_keyboard: [[
      { text: 'Refrescar', callback_data: 'salud:refresh' },
      { text: (slot.auto? 'AUTO🟢' : 'AUTO⚪'), callback_data: 'salud:auto' }
    ]]
  };
}

async function render(bot, chatId, force=false){
  const slot = SLOTS.get(chatId) || { auto:true };
  SLOTS.set(chatId, slot);
  if (slot.busy) return;
  slot.busy = true;

  try{
    const body = await snapshot(); // API-first opcional: podrías intentar /api/salud y fallback
    const kb = buildKb(slot);
    const trimmed = trimForTelegram(body, 3800);
    const sig = hash((trimmed||'') + JSON.stringify(kb) + String(slot.auto));

    if (force || sig !== slot.lastHash) {
      if (!slot.msgId) slot.msgId = await safeSend(bot, chatId, trimmed, kb);
      else await safeEdit(bot, chatId, slot.msgId, trimmed, kb);
      slot.lastHash = sig;
    }
  } catch(e){
    console.log("[/salud] soft:", e?.message||e);
  } finally {
    slot.busy = false;
  }
}

function schedule(bot, chatId){
  const slot = SLOTS.get(chatId);
  if (!slot) return;
  clearTimeout(slot.timer);
  if (slot.auto){
    slot.timer = setTimeout(()=>render(bot, chatId), REFRESH_MS);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro de comando /salud (alias /health) + callbacks
// ─────────────────────────────────────────────────────────────────────────────
export default function registerSalud(bot){
  // comando
  bot.onText(/^\/(salud|health)\b/i, async (msg) => {
    const chatId = msg.chat.id;
    await render(bot, chatId, true);
    schedule(bot, chatId);
  });

  // callbacks
  bot.on('callback_query', async (q)=>{
    const chatId = q.message?.chat?.id;
    const data   = String(q.data||'');
    if (!chatId || !data.startsWith('salud:')) return;

    const slot = SLOTS.get(chatId) || { auto:true };
    SLOTS.set(chatId, slot);

    if (data === 'salud:refresh'){
      try { await bot.answerCallbackQuery(q.id, { text:'Actualizando…', show_alert:false }); } catch {}
      await render(bot, chatId, true);
      schedule(bot, chatId);
      return;
    }
    if (data === 'salud:auto'){
      slot.auto = !slot.auto;
      try { await bot.answerCallbackQuery(q.id, { text: 'Auto: ' + (slot.auto?'ON':'OFF'), show_alert:false }); } catch {}
      await render(bot, chatId, true);
      schedule(bot, chatId);
      return;
    }
  });
}
