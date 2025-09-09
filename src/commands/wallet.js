// ─────────────────────────────────────────────────────────────────────────────
// HUNTER X — /wallet | Posiciones + ventas parciales — HX-A03 — v2025-08-20
// Características:
//   • API-first: GET /api/wallet?mode=demo|real  +  POST /api/sell {posId,pct}
//   • Un único mensaje por chat: se edita; evita “message is not modified” con hash
//   • Botones por posición: 25% / 50% / 75% / 💯  +  [🔄 Refrescar] / [Cambiar DEMO/REAL]
//   • PnL seguro: usa pnlUsd/pnlPct si vienen de API o lo calcula (entry vs now)
//   • Links útiles: DexScreener / Solscan / Jupiter / Raydium
//   • Formato Markdown con fallback a texto plano si Telegram rechaza el parse
//   • Recorte seguro a ~3800 chars (límite práctico para evitar errores de Telegram)
//
// ENV:
//   - API_BASE         (default: http://127.0.0.1:3000)
//   - WALLET_MAX_POS   (default: 10)  → máximo de posiciones mostradas por modo
//
// Invariantes:
//   - Si la API falla, mostramos error claro y no crashea el bot
//   - Nunca llamamos /api/sell con pct fuera de [1..100]
//   - Nunca renderizamos más de WALLET_MAX_POS filas para mantener el mensaje estable
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';
const MAX_POS  = Math.max(1, Number(process.env.WALLET_MAX_POS || 10));

const SLOTS = new Map(); // chatId -> { msgId, mode:'demo'|'real', lastHash, busy }

const EMO = {
  header:  '📱',
  real:    '💳',
  demo:    '🎛️',
  token:   '🪙',
  entry:   '⤵️',
  price:   '⤴️',
  invest:  '💵',
  pnl:     '📈',
  linkDs:  '📊',
  linkSc:  '🔎',
  linkJp:  '⚡',
  linkRd:  '💠',
  refresh: '🔄',
};

function hash(s){ let h=0; for (let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i), h|=0; return String(h); }
function trimForTelegram(text, maxLen = 3800) {
  if (!text || text.length <= maxLen) return text;
  return text.slice(0, maxLen - 20) + '\n\n…(recortado)';
}

function fmtUsd(n){
  return Number(n||0).toLocaleString('en-US', { style:'currency', currency:'USD', minimumFractionDigits:2, maximumFractionDigits:2 });
}
function safeSymbol(s){ return String(s||'-').replace(/\s+/g,'').toUpperCase(); }
function fmtPriceDynamic(x){
  const v = Number(x||0);
  if (!Number.isFinite(v) || v<=0) return '0.00';
  if (v < 0.0001) return v.toFixed(8);
  if (v < 0.01)   return v.toFixed(6);
  if (v < 1)      return v.toFixed(4);
  return v.toFixed(3);
}

function calcPnlSafe(pos){
  // Preferimos lo que venga calculado desde la API
  const hasPnl = typeof pos.pnlUsd === 'number' && typeof pos.pnlPct === 'number';
  if (hasPnl) return { usd: Number(pos.pnlUsd||0), pct: Number(pos.pnlPct||0) };

  // Fallback local
  const entry = Number(pos.entryPriceUsd||0);
  const now   = Number(pos.priceNowUsd||0);
  const inv   = Number(pos.investedUsd||0);
  if (entry>0 && now>0 && inv>0){
    const pct = (now/entry - 1) * 100;
    const usd = (pct/100) * inv;
    return { usd, pct };
  }
  return { usd:0, pct:0 };
}

function dsLink(mint){ return `https://dexscreener.com/solana/${mint}`; }
function scLink(mint){ return `https://solscan.io/token/${mint}`; }
function jpLink(mint){ return `https://jup.ag/swap/SOL-${mint}`; }
function rdLink(mint){ return `https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${mint}`; }

async function apiGetWallet(mode='demo'){
  const r = await fetch(`${API_BASE}/api/wallet?mode=${encodeURIComponent(mode)}`);
  if (!r.ok) throw new Error(`wallet ${mode} http ${r.status}`);
  return r.json();
}

async function apiSell(posId, pct){
  const r = await fetch(`${API_BASE}/api/sell`, {
    method:'POST',
    headers:{ 'content-type':'application/json' },
    body: JSON.stringify({ posId, pct:Number(pct) })
  });
  if (!r.ok) throw new Error(`sell http ${r.status}`);
  return r.json();
}

function buildHeader(wallet){
  const positions = Array.isArray(wallet?.positions) ? wallet.positions : [];
  const demoPositions = positions.filter(p => (p.isOpen!==false) && Number(p.investedUsd||0)>0 && (p.mode||'demo')==='demo');
  const realPositions = positions.filter(p => (p.isOpen!==false) && Number(p.investedUsd||0)>0 && (p.mode||'demo')==='real');

  const demo = wallet?.balances?.demo || { investedUsd:0, cashUsd:0, totalUsd:0 };
  const real = wallet?.balances?.real || { investedUsd:0, cashUsd:0, totalUsd:0 };

  const lines = [];
  lines.push(`💼 **VER POSICIONES ABIERTAS** /wallet\n`);
  lines.push(`${EMO.header} **Posiciones abiertas**`);
  lines.push(`- DEMO: ${demoPositions.length}`);
  lines.push(`- REAL: ${realPositions.length}`);
  lines.push(`- Total: ${demoPositions.length + realPositions.length}\n`);

  lines.push(`${EMO.real} **Billetera Phantom (REAL)**`);
  lines.push(`- Invertido: ${fmtUsd(real.investedUsd)}`);
  lines.push(`- Libre para sniper: ${fmtUsd(real.cashUsd)}`);
  lines.push(`- Total disponible: ${fmtUsd(real.totalUsd)}\n`);

  lines.push(`${EMO.demo} **Billetera DEMO**`);
  lines.push(`- Invertido: ${fmtUsd(demo.investedUsd)}`);
  lines.push(`- Libre para sniper: ${fmtUsd(demo.cashUsd)}`);
  lines.push(`- Total disponible: ${fmtUsd(demo.totalUsd)}\n`);

  return lines.join('\n');
}

function buildPositionsSection(wallet, activeMode='demo'){
  const positions = Array.isArray(wallet?.positions) ? wallet.positions : [];
  const list = positions
    .filter(p => (p.isOpen!==false) && Number(p.investedUsd||0)>0 && (p.mode||'demo')===activeMode)
    .sort((a,b)=> Number(b.openedAt||0) - Number(a.openedAt||0));

  const show = list.slice(0, MAX_POS);
  const rest = Math.max(0, list.length - show.length);

  const lines = [];
  for (const pos of show){
    const sym   = `$${safeSymbol(pos.symbol)}`;
    const entry = fmtPriceDynamic(pos.entryPriceUsd);
    const now   = fmtPriceDynamic(pos.priceNowUsd);
    const inv   = fmtUsd(pos.investedUsd||0);
    const pnl   = calcPnlSafe(pos);
    const sign  = pnl.usd>=0?'+':'';
    const pnlTxt= `${pnl.pct>=0?'+':''}${pnl.pct.toFixed(1)}% (${sign}${fmtUsd(pnl.usd)})`;

    lines.push(`${EMO.token} *${sym}*`);
    lines.push(`${EMO.entry} Precio de entrada: ${entry}`);
    lines.push(`${EMO.price} Precio actual: ${now}`);
    lines.push(`${EMO.invest} Invertido: ${inv}`);
    lines.push(`${EMO.pnl} PnL: ${pnlTxt}`);
    lines.push(`[${EMO.linkDs} DexScreener](${dsLink(pos.mint)})  [${EMO.linkSc} Solscan](${scLink(pos.mint)})  [${EMO.linkJp} Jupiter](${jpLink(pos.mint)})  [${EMO.linkRd} Raydium](${rdLink(pos.mint)})`);
    lines.push(''); // separación
  }
  if (rest>0) lines.push(`… y ${rest} posición(es) más (usa filtros o vende algunas para ver el resto).`);
  lines.push(`Modo activo: **${activeMode.toUpperCase()}**`);
  return lines.join('\n');
}

function renderWalletText(wallet, activeMode='demo'){
  const head = buildHeader(wallet);
  const body = buildPositionsSection(wallet, activeMode);
  return [head, body].join('\n');
}

function buildKeyboard(wallet, activeMode='demo'){
  const positions = Array.isArray(wallet?.positions) ? wallet.positions : [];
  const list = positions
    .filter(p => (p.isOpen!==false) && Number(p.investedUsd||0)>0 && (p.mode||'demo')===activeMode)
    .sort((a,b)=> Number(b.openedAt||0) - Number(a.openedAt||0))
    .slice(0, MAX_POS);

  const kb = [];

  // 4 botones por posición (venta parcial)
  for (const pos of list){
    kb.push([
      { text:'25%', callback_data:`sell:${pos.id}:25` },
      { text:'50%', callback_data:`sell:${pos.id}:50` },
      { text:'75%', callback_data:`sell:${pos.id}:75` },
      { text:'💯', callback_data:`sell:${pos.id}:100` },
    ]);
  }

  // Fila de acciones generales
  kb.push([
    { text:`${EMO.refresh} Refrescar`, callback_data:`refresh` },
    { text: (activeMode==='demo' ? 'Cambiar a REAL' : 'Cambiar a DEMO'), callback_data:`switch_mode` },
  ]);

  return { inline_keyboard: kb };
}

async function safeEdit(bot, chatId, messageId, text, reply_markup) {
  // 1) intentar Markdown
  try {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      reply_markup,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    return true;
  } catch (e) {
    const m = String(e?.message||e||'');
    // Si es “message is not modified”, ignoramos sin errorear
    if (/message is not modified/i.test(m)) return true;
    // 2) fallback texto plano
    await bot.editMessageText(text.replace(/\*/g,''), {
      chat_id: chatId,
      message_id: messageId,
      reply_markup,
      disable_web_page_preview: true
    });
    return true;
  }
}

async function safeSend(bot, chatId, text, reply_markup) {
  try {
    const sent = await bot.sendMessage(chatId, text, {
      reply_markup,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    return sent?.message_id;
  } catch {
    const sent = await bot.sendMessage(chatId, text.replace(/\*/g,''), {
      reply_markup,
      disable_web_page_preview: true
    });
    return sent?.message_id;
  }
}

async function renderOrEdit(bot, chatId, mode, opts = {}){
  const slot = SLOTS.get(chatId) || {};
  if (slot.busy) return;
  slot.busy = true;

  try{
    const wallet = opts.wallet || await apiGetWallet(mode);
    const textRaw = renderWalletText(wallet, mode);
    const text = trimForTelegram(textRaw, 3800);
    const reply_markup = buildKeyboard(wallet, mode);

    const sig = hash((text||'') + JSON.stringify(reply_markup));
    if (slot.msgId){
      if (sig !== slot.lastHash) {
        await safeEdit(bot, chatId, slot.msgId, text, reply_markup);
        slot.lastHash = sig;
      }
    } else {
      slot.msgId = await safeSend(bot, chatId, text, reply_markup);
      slot.lastHash = sig;
    }
    slot.mode = mode;
    SLOTS.set(chatId, slot);
  } finally {
    slot.busy = false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro del comando + callbacks
// ─────────────────────────────────────────────────────────────────────────────
function __hxComputeDemoBalances(bot, uid){
  const cap = Number(process.env.DEMO_BANK_CAP||1000);
  let invested = 0, open = 0;
  const map = bot._hxTradeInfo || {};
  const p = uid + ':';
  for (const k of Object.keys(map)) {
    if (!k.startsWith(p)) continue;
    const info = map[k] || {};
    const rem = Number(info.remUsd ?? info.amountUsdRem ?? 0);
    const remPct = Number(info.remPct ?? 0);
    if (rem>0 && remPct>0) { invested += rem; open++; }
  }
  if (invested<0) invested=0;
  if (invested>cap) invested=cap;
  const free = Math.max(0, cap - invested);
  return { cap, invested, free, open };
}

export default function registerWallet(bot){
  // /wallet [demo|real]
  bot.onText(/\/wallet(?:\s+(demo|real))?/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const mode = (match && match[1]) ? match[1].toLowerCase() : 'demo';
    try {
      await renderOrEdit(bot, chatId, mode);
    } catch (e) {
      console.error('/wallet:', e?.message||e);
      bot.sendMessage(chatId, '❌ Error al cargar wallet. Intenta de nuevo.').catch(()=>{});
    }
  });

  // Callbacks: sell, refresh, switch_mode
  bot.on('callback_query', async (q) => {
    const data = q.data || '';
    const chatId = q.message?.chat?.id;
    if (!chatId) return;

    const slot = SLOTS.get(chatId) || { mode:'demo' };

    try {
      if (data === 'refresh'){
        await renderOrEdit(bot, chatId, slot.mode);
        return bot.answerCallbackQuery(q.id, { text:'✅ Refrescado', show_alert:false }).catch(()=>{});
      }
      if (data === 'switch_mode'){
        const newMode = (slot.mode === 'demo') ? 'real' : 'demo';
        await renderOrEdit(bot, chatId, newMode);
        return bot.answerCallbackQuery(q.id, { text:`📎 Modo: ${newMode.toUpperCase()}`, show_alert:false }).catch(()=>{});
      }

      const m = data.match(/^sell:([^:]+):(\d{1,3})$/);
      if (m){
        const posId = m[1];
        const pct   = Math.max(1, Math.min(100, Number(m[2]||0)));
        let res;
        try {
          res = await apiSell(posId, pct);
        } catch (e) {
          await bot.answerCallbackQuery(q.id, { text:'❌ Error al vender', show_alert:false }).catch(()=>{});
          return;
        }
        const wallet = res?.wallet || await apiGetWallet(slot.mode);
        await renderOrEdit(bot, chatId, slot.mode, { wallet });
        const filled = typeof res?.filledUsd === 'number' ? fmtUsd(res.filledUsd) : '';
        const extra  = res?.residualClosed ? ' (pos. cerrada)' : '';
        return bot.answerCallbackQuery(q.id, { text:`✅ Vendido ${pct}% · ${filled}${extra}`, show_alert:false }).catch(()=>{});
      }
    } catch (e) {
      console.error('callback_query:', data, e?.message||e);
      bot.answerCallbackQuery(q.id, { text:'❌ Error', show_alert:false }).catch(()=>{});
    }
  });
}
