/* 
 * HUNTER X — /wallet | Posiciones abiertas — HX-W01 v2025-09-14
 * Purpose: Lista abiertos (remanente), totales y (opcional) PnL live por posición.
 * Inputs:  API /api/wallet
 * Outputs: Mensaje Telegram HTML/Markdown con cards y links a exploradores
 * Deps:    services/trading.js (curPx opcional), boot/api.js
 * ENV:     WALLET_SHOW_LIVE, HX_TZ
 * Invariants: HTML seguro; si no hay curPx, no muestra live PnL
 * Notes:   Auto-documentado; mantener esta cabecera al día.
 */

// src/commands/wallet.js
import { sumClosedPnL } from "../services/supa.js";

/** Precio live por símbolo vía Jupiter (fallback a entry si falla) */
async function getUsdQuote(symbol="SOL", fallback=0){
  try{
    const id = String(symbol||"SOL").toUpperCase();
    const url = `https://price.jup.ag/v6/price?ids=${encodeURIComponent(id)}`;
    const r = await fetch(url, { method:"GET", keepalive:false, cache:"no-store" });
    if(!r.ok) throw new Error("HTTP "+r.status);
    const js = await r.json();
    const p = js?.data?.[id]?.price;
    if (Number.isFinite(p)) return Number(p);
  }catch{}
  return Number(fallback||0);
}

function esc(s){ return String(s??"").replace(/[&<>]/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }
function arTime(d){ try{ return new Date(d).toLocaleString("es-AR",{timeZone: process.env.TZ||"America/Argentina/Buenos_Aires"});}catch{ return new Date().toLocaleString(); } }

/** Render de teclado: por cada trade abierto, filas 25/50/75/100 */
function renderWalletKeyboard(uid, openTrades){
  const rows = [];
  for(const t of openTrades){
    const tradeId = t.tradeId;
    const sym = t.symbol || "SOL";
    // etiqueta (tappable inofensivo)
    rows.push([{ text: `🔹 $${sym} (${tradeId})`, callback_data: 'hxv1|noop' }]);
    rows.push([
      { text: "25%", callback_data: `hxv1|sell|${uid}|${tradeId}|25` },
      { text: "50%", callback_data: `hxv1|sell|${uid}|${tradeId}|50` },
      { text: "75%", callback_data: `hxv1|sell|${uid}|${tradeId}|75` },
      { text: "💯",  callback_data: `hxv1|sell|${uid}|${tradeId}|100` }
    ]);
  }
  // última fila: actualizar
  rows.push([{ text:"🔄 Actualizar", callback_data: `hxv1|wallet|refresh|${uid}` }]);
  return { inline_keyboard: rows };
}

/** Construye el texto del /wallet con PNL live por abierto */
async function buildWalletText(bot, uid){
  const cap = Number(process.env.DEMO_BANK_CAP||1000);

  // listar abiertos del usuario (map de la tarjeta)
  const opens = [];
  for(const [k,v] of Object.entries(bot._hxTradeInfo || {})){
    if(!k.startsWith(`${uid}:`)) continue;
    const remUsd = Number(v.amountUsdRem ?? v.remUsd ?? 0);
    if(remUsd <= 0) continue;
    const trade = {
      tradeId: v.tradeId || k.split(":")[1],
      symbol: v.symbol || "SOL",
      mint: v.mint || "So11111111111111111111111111111111111111112",
      entry: Number(v.entryUsd||0),
      remUsd,
      ts: v.ts || new Date().toISOString(),
    };
    opens.push(trade);
  }

  // header libre/invertido/total
  const totalInv = opens.reduce((a,b)=>a + Number(b.remUsd||0), 0);
  const libre = Math.max(0, cap - totalInv);
  const header = [
    "💼 <b>Billetera DEMO</b>",
    "💵 <b>Libre:</b> $"+libre.toFixed(2)+"  •  <b>Invertido:</b> $"+totalInv.toFixed(2)+"  •  <b>Total:</b> $"+cap.toFixed(2)
  ].join("\n");

  // PNL live por abierto (una cotización por símbolo; cache simple local)
  const quoteCache = {};
  let aggPnlUsd = 0;

  const cards = [];
  for(const t of opens){
    const live = quoteCache[t.symbol] ?? (quoteCache[t.symbol] = await getUsdQuote(t.symbol, t.entry));
    const entry = Number(t.entry||0);
    const remUsd = Number(t.remUsd||0);

    let qty = 0, pnlUsd = 0, pnlPct = 0;
    if(entry>0 && remUsd>0){
      qty = remUsd / entry;
      pnlUsd = qty * (live - entry);
      pnlPct = entry>0 ? ((live/entry)-1)*100 : 0;
      aggPnlUsd += pnlUsd;
    }

    const linkDex = `https://dexscreener.com/solana/${t.mint}`;
    const linkScan= `https://solscan.io/token/${t.mint}`;

    const lines = [
      "🪙 <b>Token:</b> $"+esc(t.symbol),
      "📈 <b>Precio de entrada:</b> " + (entry? entry.toFixed(4):"—"),
      "📤 <b>Precio actual:</b> "   + (live? live.toFixed(4) :"—"),
      "💵 <b>Invertido (remanente):</b> " + remUsd.toFixed(2) + " USD",
      "📈 <b>Ganancia (NO realizada):</b> " + (pnlUsd>=0? "+":"") + pnlUsd.toFixed(2) + " USD (" + (pnlPct>=0? "+":"") + pnlPct.toFixed(2) + "%)",
      `<a href="${linkDex}">📊 DexScreener</a>  <a href="${linkScan}">📎 Solscan</a>`
    ];
    cards.push(lines.join("\n"));
  }

  // PNL cerradas (hoy/semana/mes)
  const dayNum = (d)=>Number(String(d).slice(0,10).replace(/-/g,""));
  const now = new Date();
  const yyyy = now.getFullYear(), mm = now.getMonth(), dd = now.getDate();
  const toDay = dayNum(now.toISOString());
  const startOfWeek = new Date(yyyy, mm, dd - ((now.getDay()+6)%7)); // lunes
  const startOfMonth= new Date(yyyy, mm, 1);
  const fromDayToday  = toDay;
  const fromDayWeek   = dayNum(startOfWeek.toISOString());
  const fromDayMonth  = dayNum(startOfMonth.toISOString());

  let pnlToday={inv:0,pnl:0}, pnlWeek={inv:0,pnl:0}, pnlMonth={inv:0,pnl:0};
  try{ pnlToday = await sumClosedPnL({mode:"DEMO", fromDay:fromDayToday, toDay:toDay}); }catch{}
  try{ pnlWeek  = await sumClosedPnL({mode:"DEMO", fromDay:fromDayWeek,  toDay:toDay}); }catch{}
  try{ pnlMonth = await sumClosedPnL({mode:"DEMO", fromDay:fromDayMonth, toDay:toDay}); }catch{}

  const footer = [
    cards.length ? ("📈 <b>PNL LIVE (abiertos):</b> " + (aggPnlUsd>=0?"+":"") + aggPnlUsd.toFixed(2) + " USD (" + (totalInv>0 ? ((aggPnlUsd/totalInv)*100).toFixed(2) : "0.00") + "%)") : "",
    "📈 <b>PNL (cerradas)</b>",
    "• <b>Hoy:</b> $" + pnlToday.pnl.toFixed(2) + " (" + (pnlToday.inv>0 ? ((pnlToday.pnl/pnlToday.inv)*100).toFixed(2) : "0.00") + "%)",
    "• <b>Semana:</b> $" + pnlWeek.pnl.toFixed(2) + " (" + (pnlWeek.inv>0 ? ((pnlWeek.pnl/pnlWeek.inv)*100).toFixed(2) : "0.00") + "%)",
    "• <b>Mes:</b> $" + pnlMonth.pnl.toFixed(2) + " (" + (pnlMonth.inv>0 ? ((pnlMonth.pnl/pnlMonth.inv)*100).toFixed(2) : "0.00") + "%)"
  ].filter(Boolean).join("\n");

  const txt = header + (cards.length? "\n" + cards.join("\n\n") : "") + "\n\n" + footer;
  const kb  = renderWalletKeyboard(uid, opens);
  return { txt, kb };
}

export default function registerWallet(bot){
  bot._hxWalletMsg = bot._hxWalletMsg || {};
  // handler /wallet
  bot.onText(/^\/wallet\b/i, async (msg) => {
    const uid = String(msg.from.id);
    try{
      const { txt, kb } = await buildWalletText(bot, uid);
      const res = await bot.sendMessage(msg.chat.id, txt, { parse_mode:"HTML", disable_web_page_preview:true, reply_markup: kb });
      bot._hxWalletMsg[uid] = { chatId: msg.chat.id, message_id: res.message_id };
    }catch(e){
      await bot.sendMessage(msg.chat.id, "❌ /wallet error: " + (e?.message||e));
    }
  });

  // callback "actualizar"
  bot.on("callback_query", async (q)=>{
    const m = String(q?.data||"").match(/^hxv1\|wallet\|refresh\|(\d+)$/);
    if(!m) return;
    const uid = m[1];
    try{
      await bot.answerCallbackQuery(q.id, { text:"🔄 Actualizando…", show_alert:false });
    }catch{}
    try{
      const ref = bot._hxWalletMsg?.[uid];
      if(!ref?.chatId || !ref?.message_id) return;
      const { txt, kb } = await buildWalletText(bot, uid);
      await bot.editMessageText(txt, { chat_id: ref.chatId, message_id: ref.message_id, parse_mode:"HTML", disable_web_page_preview:true, reply_markup: kb });
    }catch(e){
      try{ await bot.answerCallbackQuery(q.id, { text:"⚠️ No se pudo actualizar", show_alert:false }); }catch{}
    }
  });

  // expone refresco programático para inlinePnlSell
  bot._hxRefreshWallet = async (uid)=>{
    try{
      const ref = bot._hxWalletMsg?.[uid];
      if(!ref?.chatId || !ref?.message_id) return;
      const { txt, kb } = await buildWalletText(bot, uid);
      await bot.editMessageText(txt, { chat_id: ref.chatId, message_id: ref.message_id, parse_mode:"HTML", disable_web_page_preview:true, reply_markup: kb });
    }catch{}
  };
}
