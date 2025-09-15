// ─────────────────────────────────────────────────────────────────────────────
// HUNTER X — /control | Panel visual (literal) — v2025-09-14 (ESM)
// • Layout EXACTO pedido por el usuario (no tocar formato/órden/espacios).
// • Botones: [Actualizar] y [AUTO ON/OFF] (inline). Sin enlaces extras.
// • Auto-refresh sin parpadeo (no edita si el texto no cambió).
// • Si no hay datos, muestra “—” y $0.00 sin romper.
// • Intenta leer /api/control y /api/wallet (opcional). Si no existen, “—”.
// ─────────────────────────────────────────────────────────────────────────────

const SLOTS = new Map();                    // chatId -> { msgId, auto, timer, busy, lastHash }
const REFRESH_MS = Number(process.env.CONTROL_REFRESH_MS || 15000);
const API_PORT   = Number(process.env.API_PORT || 3000);

// ─────────── Helpers básicos
function hash(s){ let h=0; for(let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i), h|=0; return String(h); }
function tz() { return process.env.HX_TZ || process.env.TZ || 'America/Argentina/Buenos_Aires'; }
function fmtNow(){
  try { return new Date().toLocaleString('es-AR', { timeZone: tz() }); }
  catch { return new Date().toISOString(); }
}

async function fetchJson(url, { timeoutMs=2000 } = {}){
  const ac = new AbortController(); const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
  try{
    const r = await fetch(url, { signal: ac.signal });
    const ok = r.ok;
    let json=null; try{ json = await r.json(); }catch{}
    return { ok, json, status:r.status };
  }catch(e){ return { ok:false, json:null, status:null }; }
  finally{ clearTimeout(t); }
}

async function safeEdit(bot, chatId, messageId, text, kb){
  try{
    await bot.editMessageText(text, { chat_id:chatId, message_id:messageId, reply_markup:kb, disable_web_page_preview:true });
    return true;
  }catch(e){
    const m = String(e?.message||e||'');
    if (m.includes('message is not modified')) return false; // ignorar ruido
    return false;
  }
}

async function safeSend(bot, chatId, text, kb){
  const m = await bot.sendMessage(chatId, text, { reply_markup:kb, disable_web_page_preview:true }).catch(()=>null);
  return m?.message_id;
}

// ─────────── Datos (best-effort)
async function readSnapshot(){
  const mode = (global.__HX_MODE__) || process.env.HX_DEFAULT_MODE || 'DEMO';

  // valores por defecto (mostrar “—” o 0.00)
  let discovered=null, withPool=null, passedSec=null, passedHard=null;
  let prioritized=null, entries=null, tpCount=null, slCount=null;
  let freeUSD=0, investedRemUSD=0, totalUSD=0;
  let openCount=0, pnlLiveUsd=0, pnlLivePct=0;
  let pnlWeek=0, pnlMonth=0, winrate=null, hits30=0, hits50=0, hits100=0;
  let latency=null, sources='Gecko, Raydium', apiErrors=0, retries=0;

  // API opcional: /api/control
  const rCtl = await fetchJson(`http://127.0.0.1:${API_PORT}/api/control`, { timeoutMs: 1200 });
  if (rCtl.ok && rCtl.json){
    const j = rCtl.json;
    if (Number.isFinite(j?.discovered))  discovered  = j.discovered;
    if (Number.isFinite(j?.withPool))    withPool    = j.withPool;
    if (Number.isFinite(j?.passedSec))   passedSec   = j.passedSec;
    if (Number.isFinite(j?.passedHard))  passedHard  = j.passedHard;
    if (Number.isFinite(j?.prioritized)) prioritized = j.prioritized;
    if (Number.isFinite(j?.entries))     entries     = j.entries;
    if (Number.isFinite(j?.tpCount))     tpCount     = j.tpCount;
    if (Number.isFinite(j?.slCount))     slCount     = j.slCount;

    if (Number.isFinite(j?.hits30))      hits30      = j.hits30;
    if (Number.isFinite(j?.hits50))      hits50      = j.hits50;
    if (Number.isFinite(j?.hits100))     hits100     = j.hits100;
    if (typeof j?.winrate === 'string' || Number.isFinite(j?.winrate)) winrate = j.winrate;

    if (Number.isFinite(j?.pnlWeek))     pnlWeek     = j.pnlWeek;
    if (Number.isFinite(j?.pnlMonth))    pnlMonth    = j.pnlMonth;

    if (Number.isFinite(j?.latencyMs))   latency     = j.latencyMs;
    if (typeof j?.sources === 'string')  sources     = j.sources || sources;
    if (Number.isFinite(j?.apiErrors))   apiErrors   = j.apiErrors;
    if (Number.isFinite(j?.retries))     retries     = j.retries;
  }

  // API opcional: /api/wallet?mode=...
  const rWal = await fetchJson(`http://127.0.0.1:${API_PORT}/api/wallet?mode=${mode}`, { timeoutMs: 1200 });
  if (rWal.ok && rWal.json){
    const w = rWal.json;
    if (Number.isFinite(w?.freeUSD))        freeUSD        = w.freeUSD;
    if (Number.isFinite(w?.investedRemUSD)) investedRemUSD = w.investedRemUSD;
    if (Number.isFinite(w?.totalUSD))       totalUSD       = w.totalUSD;
    if (Number.isFinite(w?.openCount))      openCount      = w.openCount;
    if (Number.isFinite(w?.pnlLiveUsd))     pnlLiveUsd     = w.pnlLiveUsd;
    if (Number.isFinite(w?.pnlLivePct))     pnlLivePct     = w.pnlLivePct;
  } else {
    totalUSD = freeUSD + investedRemUSD;
  }

  return {
    mode, discovered, withPool, passedSec, passedHard, prioritized, entries, tpCount, slCount,
    freeUSD, investedRemUSD, totalUSD, openCount, pnlLiveUsd, pnlLivePct,
    pnlWeek, pnlMonth, winrate, hits30, hits50, hits100, latency, sources, apiErrors, retries
  };
}

// ─────────── Render (TEXTO LITERAL SOLICITADO)
function renderText(s){
  const dash  = (v)=> (v===null || v===undefined ? '—' : String(v));
  const money = (n)=> (Number.isFinite(n) ? `$${Number(n).toFixed(2)}` : '$0.00');
  const pct   = (p)=> (Number.isFinite(p) ? `${(p>=0?'+':'')}${p.toFixed(2)}%` : '+0.00%');
  const now   = fmtNow();

  return `📊 Control — Modo: ${s.mode || 'DEMO'} — Hoy (${now})
 
🔎 Descubiertos (feed): ${dash(s.discovered)} Con pool activo (Raydium/Orca): ${dash(s.withPool)}
 
🛡️ Pasan seguridad: ${dash(s.passedSec)} Pasan liq/FDV/quote (filtros duros): ${dash(s.passedHard)}
 
🎯 Candidatos priorizados: ${dash(s.prioritized)} Entradas ejecutadas: ${dash(s.entries)} 
• Parciales TP: ${dash(s.tpCount)} 
• Stops: ${dash(s.slCount)}
 
💼 Capital (${s.mode || 'DEMO'}) 
• Libre: ${money(s.freeUSD)} 
• Invertido (remanente): ${money(s.investedRemUSD)} 
• Total: ${money(s.totalUSD)}
 
📈 PnL no realizado (abiertos) 
• Abiertos: ${dash(s.openCount)} 
• PnL live: ${money(s.pnlLiveUsd)} (${pct(s.pnlLivePct)})
 
💰 PnL realizado (cerradas hoy) 
• Ganancia neta: ${money(0)}   (WinRate: ${s.winrate ?? '—'})
 
🎉 Hits por tramo 
• ≥ +30%: ${dash(s.hits30)} 
• ≥ +50%: ${dash(s.hits50)} 
• ≥ +100%
 
💵 PnL (acumulados) 
• Semana: ${money(s.pnlWeek)} 
• Mes: ${money(s.pnlMonth)}
 
🔧 Operativa 
• Latencia media quote: ${s.latency!=null ? s.latency+' ms' : '—'} 
• Fuentes: ${s.sources} • Errores API: ${dash(s.apiErrors)} 
• Retries: ${dash(s.retries)}`;
}

function kb(slot){
  const autoText = slot.auto ? 'AUTO🟢' : 'AUTO⚪';
  return { inline_keyboard: [[
    { text:'Actualizar', callback_data:'control:refresh' },
    { text:autoText,     callback_data:'control:auto' }
  ]]};
}

// ─────────── Ciclo render/schedule
async function render(bot, chatId, force=false){
  const slot = SLOTS.get(chatId) || { auto:true };
  SLOTS.set(chatId, slot);
  if (slot.busy) return;
  slot.busy = true;

  try{
    const snapshot = await readSnapshot();
    const text = renderText(snapshot);
    const k = kb(slot);
    const sig = hash(text + JSON.stringify(k) + String(slot.auto));

    if (force || sig !== slot.lastHash){
      if (!slot.msgId) slot.msgId = await safeSend(bot, chatId, text, k);
      else await safeEdit(bot, chatId, slot.msgId, text, k);
      slot.lastHash = sig;
    }
  }catch(e){
    try{ await bot.sendMessage(chatId, '❌ Control: '+(e?.message||e)); }catch{}
  }finally{
    slot.busy = false;
  }
}

function schedule(bot, chatId){
  const slot = SLOTS.get(chatId);
  if (!slot) return;
  clearTimeout(slot.timer);
  if (slot.auto) slot.timer = setTimeout(()=>render(bot, chatId), REFRESH_MS);
}

// ─────────── Registro /control
export default function registerControl(bot){
  bot.onText(/^\/control\b/i, async (msg)=>{
    const chatId = msg.chat.id;
    await render(bot, chatId, true);
    schedule(bot, chatId);
  });

  bot.on('callback_query', async (q)=>{
    const chatId = q.message?.chat?.id;
    const data = String(q.data||'');
    if (!chatId || !data.startsWith('control:')) return;

    const slot = SLOTS.get(chatId) || { auto:true };
    SLOTS.set(chatId, slot);

    if (data === 'control:refresh'){
      try { await bot.answerCallbackQuery(q.id, { text:'Actualizando…', show_alert:false }); } catch {}
      await render(bot, chatId, true);
      schedule(bot, chatId);
      return;
    }
    if (data === 'control:auto'){
      slot.auto = !slot.auto;
      try { await bot.answerCallbackQuery(q.id, { text:'Auto: '+(slot.auto?'ON':'OFF') }); } catch {}
      await render(bot, chatId, true);
      schedule(bot, chatId);
      return;
    }
  });
}
// ─────────────────────────────────────────────────────────────────────────────
