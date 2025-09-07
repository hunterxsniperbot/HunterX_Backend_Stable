import * as gecko from '../services/candidatesGecko.js';
import * as pref  from '../services/marketsPref.js';

export default function registerCandidatos(bot) {
  console.log('✅ Handler cargado: candidatos.js');

  const TTL_SEC   = Number(process.env.CAND_TTL_SEC   || 25);
  const PAGE_SIZE = Number(process.env.CAND_PAGE_SIZE || 3);
  const MAX_ITEMS = Number(process.env.CAND_TOP       || 9);
  const MIN_LIQ   = Number(process.env.CAND_MIN_LIQ_USD || 15000);
  const MAX_FDV   = Number(process.env.CAND_MAX_FDV_USD || 300000);

  const CACHE = new Map(); // uid -> {ts, items, pages, page, msgId}

  const esc = (s='') => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const money = (v) => {
    const x = Number(v); if (!isFinite(x)) return '—';
    if (x >= 1e6) return '$'+(x/1e6).toFixed(2)+'M';
    if (x >= 1e3) return '$'+(x/1e3).toFixed(1)+'k';
    return '$'+x.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
  };
  const fmtUSD = (v) => {
    const x = Number(v); if (!isFinite(x)) return '—';
    if (x >= 1e6) return '$'+(x/1e6).toFixed(2)+'M';
    if (x >= 1e3) return '$'+(x/1e3).toFixed(1)+'k';
    return '$'+x.toFixed(2);
  };
  const linkDS = (pair) => `https://dexscreener.com/solana/${pair}`;
  const linkGk = (pair) => `https://www.geckoterminal.com/solana/pools/${pair}`;
  const chunk  = (a,n)=>{const o=[];for(let i=0;i<a.length;i+=n)o.push(a.slice(i,i+n));return o;};

  async function getCandidates() {
    try {
      const list = await gecko.discoverTop({ minLiqUsd: MIN_LIQ, maxFdvUsd: MAX_FDV, top: MAX_ITEMS });
      if (Array.isArray(list) && list.length) return list;
    } catch {}
    try {
      const pairs = await pref.getSolanaPairs({ limit: MAX_ITEMS * 2 });
      const norm = (pairs||[]).map(p => ({
        source: p.source || 'pref',
        pairAddress: p.pairAddress,
        sym: (p.baseSymbol||p.sym||'?').trim(),
        quote: (p.quoteSymbol||p.quote||'SOL').trim(),
        priceUsd: Number(p.priceUsd || 0),
        liqUsd: Number(p.liquidityUsd || 0),
        fdvUsd: Number(p.fdvUsd || 0),
      })).filter(x => x.liqUsd >= MIN_LIQ && x.fdvUsd > 0 && x.fdvUsd <= MAX_FDV)
        .slice(0, MAX_ITEMS);
      return norm;
    } catch {}
    return [];
  }

  function renderPage(items, page, totalPages) {
    const lines = [];
    lines.push('🎯 <b>Top Candidatos</b> — pag ' + (page+1) + '/' + totalPages);
    lines.push('Filtros: liq ≥ ' + fmtUSD(MIN_LIQ) + ' · FDV ≤ ' + fmtUSD(MAX_FDV));
    lines.push('');
    items.forEach((t,i) => {
      const name = esc(t.sym || 'Token');
      const px   = money(t.priceUsd);
      const liq  = fmtUSD(t.liqUsd);
      const fdv  = fmtUSD(t.fdvUsd);
      const pair = esc(t.pairAddress||'');
      lines.push(`${i+1}. <b>$${name}</b> <i>(${esc(t.source)})</i>\n💵 Precio: ${px}\n💧 Liq: ${liq}\n🏷️ FDV: ${fdv}\n<a href="${linkDS(pair)}">DexScreener</a> · <a href="${linkGk(pair)}">Gecko</a>\n`);
    });
    lines.push('— Card informativa: el Sniper decide aparte.');
    return lines.join('\n');
  }
  function kbNav(page, totalPages) {
    const row=[];
    if (page>0) row.push({text:'« Anterior', callback_data:'cand:prev'});
    row.push({text:'🔄 Refrescar', callback_data:'cand:refresh'});
    if (page<totalPages-1) row.push({text:'Siguiente »', callback_data:'cand:next'});
    return { inline_keyboard:[row] };
  }

  // (eliminar cualquier listener previo muy amplio)
  try {
    bot.removeTextListener?.(/^\/candidatos$/i);
    bot.removeTextListener?.(/^\s*\/candidatos.*$/i);
  } catch {}

  bot.onText(/^\s*\/candidatos(?:\s+(\d+|refresh))?\s*$/i, async (msg, m) => {
    const uid    = String(msg.from.id);
    const chatId = msg.chat.id;
    const arg    = (m && m[1]) ? String(m[1]).toLowerCase() : '';
    const now    = Date.now();
    const slot   = CACHE.get(uid) || {};

    const needFetch = arg === 'refresh' || !slot.ts || (now - slot.ts) > TTL_SEC*1000;
    if (needFetch) {
      const items = await getCandidates();
      const pages = ((arr, n)=>{const o=[];for(let i=0;i<arr.length;i+=n)o.push(arr.slice(i,i+n));return o;})(items, PAGE_SIZE);
      CACHE.set(uid, { ts: now, items, pages, page: 0, msgId: slot.msgId||null });
    } else {
      CACHE.set(uid, { ...slot });
    }

    const curr = CACHE.get(uid);
    const totalPages = curr.pages?.length || 0;

    let text, kb;
    if (!totalPages) {
      text = '👀 <b>Candidatos</b>\nNo hay items que cumplan filtros ahora.';
      kb   = { inline_keyboard: [[{text:'🔄 Refrescar', callback_data:'cand:refresh'}]] };
    } else {
      const page = Math.max(0, Math.min(curr.page||0, totalPages-1));
      text = renderPage(curr.pages[page], page, totalPages);
      kb   = kbNav(page, totalPages);
    }

    if (!curr.msgId) {
      const m2 = await bot.sendMessage(chatId, text, { parse_mode:'HTML', reply_markup: kb, disable_web_page_preview:true });
      curr.msgId = m2?.message_id;
      CACHE.set(uid, curr);
    } else {
      await bot.editMessageText(text, { chat_id: chatId, message_id: curr.msgId, parse_mode:'HTML', reply_markup: kb, disable_web_page_preview:true });
    }
  });

  bot.on('callback_query', async (q) => {
    const data = String(q.data||'');
    if (!data.startsWith('cand:')) return;
    const uid    = String(q.from.id);
    const chatId = q.message?.chat?.id;
    if (!chatId) return;

    const curr = CACHE.get(uid);
    if (!curr){ try{ await bot.answerCallbackQuery(q.id,{text:'Sin cache; usá /candidatos'});}catch{}; return; }

    if (data==='cand:refresh'){
      const items = await getCandidates();
      curr.ts = Date.now();
      curr.items = items;
      curr.pages = ((arr,n)=>{const o=[];for(let i=0;i<arr.length;i+=n)o.push(arr.slice(i,i+n));return o;})(items, PAGE_SIZE);
      curr.page = 0;
    } else if (data==='cand:next'){
      curr.page = Math.min((curr.page||0)+1, Math.max(0,(curr.pages?.length||1)-1));
    } else if (data==='cand:prev'){
      curr.page = Math.max(0, (curr.page||0)-1);
    }

    const totalPages = curr.pages?.length || 0;
    let text, kb;
    if (!totalPages) {
      text = '👀 <b>Candidatos</b>\nNo hay items que cumplan filtros ahora.';
      kb   = { inline_keyboard: [[{text:'🔄 Refrescar', callback_data:'cand:refresh'}]] };
    } else {
      const page = Math.max(0, Math.min(curr.page||0, totalPages-1));
      text = renderPage(curr.pages[page], page, totalPages);
      kb   = kbNav(page, totalPages);
    }

    await bot.editMessageText(text, { chat_id: chatId, message_id: curr.msgId, parse_mode:'HTML', reply_markup: kb, disable_web_page_preview: true });
    try { await bot.answerCallbackQuery(q.id).catch(()=>{}); } catch {}
    CACHE.set(uid, curr);
  });
}
