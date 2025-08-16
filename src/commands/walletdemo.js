// src/commands/walletdemo.js — DEMO wallet con ventas parciales + AUTO refresh HTML
import * as fs from 'fs';
import * as path from 'path';
import * as prices from '../services/prices.js';
import * as trading from '../services/trading.js'; // gancho futuro (REAL)

const REFRESH_MS = Number(process.env.WALLET_REFRESH_MS || '5000'); // 5s por defecto
const SLOTS = new Map(); // chatId -> { messageId, auto, lastEdit }

function loadState() {
  const p = path.join(process.cwd(), 'data', 'state.json');
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; }
}
function saveState(st) {
  const p = path.join(process.cwd(), 'data', 'state.json');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(st, null, 2));
}

function fmtUsd(n) {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD', maximumFractionDigits:2 }).format(Number(n));
}
function short(s, n=6) {
  if (!s) return '—';
  return s.length > 2*n ? s.slice(0,n) + '…' + s.slice(-n) : s;
}
function esc(s='') {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}
function linkDex(mint){ return `https://dexscreener.com/solana/${mint}`; }
function linkSolscan(mint){ return `https://solscan.io/token/${mint}`; }

function calcPnl(pos, lastPriceUsd) {
  if (!pos?.entryPriceUsd || !lastPriceUsd || !pos?.investedUsd) return { pct: '—', usd: '—' };
  const tokensHeld = Number(pos.investedUsd) / Number(pos.entryPriceUsd);
  const mktUsd     = tokensHeld * Number(lastPriceUsd);
  const pnlUsd     = mktUsd - Number(pos.investedUsd);
  const pnlPct     = (Number(pos.investedUsd) > 0) ? (pnlUsd / Number(pos.investedUsd)) * 100 : 0;
  return { pct: `${pnlPct.toFixed(1)}%`, usd: fmtUsd(pnlUsd) };
}

function demoSellPercent(state, posId, pct, lastPriceUsd) {
  const pools = [state.positions?.demo || [], state.positions?.real || []];
  let pos; let arr; let idx = -1;
  for (const a of pools) {
    const k = a.findIndex(x => x?.id === posId);
    if (k >= 0) { pos = a[k]; arr = a; idx = k; break; }
  }
  if (!pos) throw new Error('Posición no encontrada');

  pct = Math.min(100, Math.max(1, Number(pct || 0)));
  const fraction   = pct / 100;
  const entry      = Number(pos.entryPriceUsd || 0);
  const inv        = Number(pos.investedUsd   || 0);
  if (entry <= 0 || inv <= 0) throw new Error('Entrada o invertido inválido');

  const tokensHeld   = inv / entry;
  const tokensToSell = tokensHeld * fraction;

  const proceedsUsd  = tokensToSell * Number(lastPriceUsd || entry);
  const costUsd      = inv * fraction;
  const realizedPnl  = proceedsUsd - costUsd;

  pos.realizedUsd     = Number(pos.realizedUsd    || 0) + proceedsUsd;
  pos.realizedPnlUsd  = Number(pos.realizedPnlUsd || 0) + realizedPnl;
  pos.realizedAt      = Date.now();
  pos.fills           = Array.isArray(pos.fills) ? pos.fills : [];
  pos.fills.push({ type:'sell', pct, proceedsUsd, realizedPnl, at: pos.realizedAt, priceUsd: lastPriceUsd });

  pos.investedUsd = inv - costUsd;
  if (pos.investedUsd <= 0.000001) {
    pos.investedUsd = 0;
    pos.isOpen = false;
    pos.status = 'closed';
    pos.closedAt = Date.now();
  }

  saveState(state);
  return { proceedsUsd, realizedPnl };
}

async function enrichWithPrice(items) {
  const out = [];
  for (const pos of items) {
    let lastPriceUsd = null;
    try {
      const p = await prices.getPriceUSD(pos.mint);
      lastPriceUsd = Number(p?.price || 0) || null;
    } catch {}
    out.push({ ...pos, lastPriceUsd });
  }
  return out;
}

async function renderHTML(chatId) {
  const st = loadState();
  const demo = Array.isArray(st.positions?.demo) ? st.positions.demo.filter(p => p?.isOpen !== false && p?.status !== 'closed') : [];
  const real = Array.isArray(st.positions?.real) ? st.positions.real.filter(p => p?.isOpen !== false && p?.status !== 'closed') : [];

  const items = [
    ...demo.map(x => ({...x, _mode:'DEMO'})),
    ...real.map(x => ({...x, _mode:'REAL'}))
  ].slice(0, 10);

  const enriched = await enrichWithPrice(items);

  const lines = [];
  lines.push('<b>📱 Posiciones abiertas</b>');
  lines.push('');
  lines.push(`• DEMO: ${demo.length}`);
  lines.push(`• REAL: ${real.length}`);
  lines.push(`• Total: ${demo.length + real.length}`);
  lines.push('');
  lines.push('<b>💳 Billetera Phantom (REAL)</b>');
  lines.push(`• Address: <code>${esc(short(process.env.PHANTOM_ADDRESS || ''))}</code>`);
  lines.push(`• Invertido: —`);
  lines.push(`• Libre para sniper: —`);
  lines.push(`• Total disponible: —`);
  lines.push('');
  lines.push('<b>🧪 Billetera DEMO</b>');
  lines.push(`• Invertido: —`);
  lines.push(`• Libre para sniper: ${fmtUsd(Number(process.env.DEMO_CASH_USD||'1000'))}`);
  lines.push(`• Total disponible: —`);
  lines.push('');

  const ik = [];
  for (const pos of enriched) {
    const pnl = calcPnl(pos, pos.lastPriceUsd);
    lines.push(`🪙 <b>$${esc(pos.symbol || 'TOKEN')}</b> <i>(${esc(pos._mode)})</i>`);
    lines.push(`📥 Entrada: ${pos.entryPriceUsd ?? '—'}`);
    lines.push(`📤 Actual: ${pos.lastPriceUsd ?? '—'}`);
    lines.push(`💵 Invertido: ${fmtUsd(pos.investedUsd)}`);
    lines.push(`📈 PnL: ${esc(pnl.pct)} (${esc(pnl.usd)})`);
    lines.push(`<a href="${esc(linkDex(pos.mint))}">📊 DexScreener</a>  |  <a href="${esc(linkSolscan(pos.mint))}">📎 Solscan</a>`);
    lines.push('');

    ik.push([
      { text: '🔁 25%', callback_data: `walletdemo:sell:${pos.id}:25` },
      { text: '🔁 50%', callback_data: `walletdemo:sell:${pos.id}:50` },
      { text: '🔁 75%', callback_data: `walletdemo:sell:${pos.id}:75` },
      { text: '💯 Vender', callback_data: `walletdemo:sell:${pos.id}:100` }
    ]);
  }

  const slot = SLOTS.get(String(chatId)) || { auto: true };
  const autoLabel = slot.auto ? '🟢 Auto: ON' : '⚫ Auto: OFF';
  ik.push([
    { text: '🔄 Refrescar', callback_data: 'walletdemo:refresh' },
    { text: autoLabel,     callback_data: 'walletdemo:toggle'  },
  ]);

  return { text: lines.join('\n'), keyboard: { inline_keyboard: ik } };
}

let LOOP = null;
function ensureLoop(bot) {
  if (LOOP) return;
  LOOP = setInterval(async () => {
    for (const [chatId, slot] of SLOTS) {
      try {
        if (!slot.auto) continue;
        const now = Date.now();
        if (now - (slot.lastEdit || 0) < REFRESH_MS - 100) continue;
        const view = await renderHTML(chatId);
        await bot.editMessageText(view.text, {
          chat_id: chatId,
          message_id: slot.messageId,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: view.keyboard
        });
        slot.lastEdit = Date.now();
      } catch (e) {
        // errores típicos: message is not modified / message to edit not found
      }
    }
  }, REFRESH_MS);
}

export default function registerWalletDemo(bot) {
  bot.onText(/^\/walletdemo$/, async (msg) => {
    const chatId = msg.chat.id;
    const view = await renderHTML(chatId);
    const sent = await bot.sendMessage(chatId, view.text, {
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: view.keyboard
    });
    SLOTS.set(String(chatId), { messageId: sent.message_id, auto: true, lastEdit: Date.now() });
    ensureLoop(bot);
  });

  bot.on('callback_query', async (q) => {
    try {
      const data   = String(q.data || '');
      const chatId = q.message?.chat?.id;
      const msgId  = q.message?.message_id;
      if (!chatId || !msgId) return;

      const slot = SLOTS.get(String(chatId)) || { messageId: msgId, auto: true };
      SLOTS.set(String(chatId), slot); // asegura

      if (data === 'walletdemo:toggle') {
        slot.auto = !slot.auto;
        const view = await renderHTML(chatId);
        await bot.editMessageText(view.text, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: view.keyboard
        });
        await bot.answerCallbackQuery(q.id, { text: `Auto: ${slot.auto ? 'ON' : 'OFF'}` }).catch(()=>{});
        return;
      }

      if (data === 'walletdemo:refresh') {
        const view = await renderHTML(chatId);
        await bot.editMessageText(view.text, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: view.keyboard
        });
        await bot.answerCallbackQuery(q.id).catch(()=>{});
        return;
      }

      // walletdemo:sell:<id>:<pct>
      const m = data.match(/^walletdemo:sell:([^:]+):([0-9]+)$/);
      if (m) {
        const posId = m[1];
        const pct   = Number(m[2]);

        const st = loadState();
        const pools = [
          ...((st.positions?.demo||[]).map(x => ({...x,_arr:'demo'}))),
          ...((st.positions?.real||[]).map(x => ({...x,_arr:'real'})))
        ];
        const pos = pools.find(x => x.id === posId);
        if (!pos) throw new Error('Posición no encontrada');

        let last = pos.lastPriceUsd;
        if (!last) {
          try { const r = await prices.getPriceUSD(pos.mint); last = Number(r?.price || 0) || null; } catch {}
        }
        if (!last) throw new Error('No pude obtener precio actual');

        if ((pos._arr || pos.mode) === 'demo') {
          demoSellPercent(st, posId, pct, last);
          await bot.answerCallbackQuery(q.id, { text: `DEMO vendido ${pct}% ✅` }).catch(()=>{});
        } else {
          if (typeof trading.sellPercent === 'function') {
            await trading.sellPercent({ id: posId, mint: pos.mint, symbol: pos.symbol }, pct, { priceUsd: last });
            await bot.answerCallbackQuery(q.id, { text: `REAL ${pct}% enviado ✅` }).catch(()=>{});
          } else {
            await bot.answerCallbackQuery(q.id, { text: `REAL aún no disponible aquí` }).catch(()=>{});
          }
        }

        const view = await renderHTML(chatId);
        await bot.editMessageText(view.text, {
          chat_id: chatId,
          message_id: msgId,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          reply_markup: view.keyboard
        });
        SLOTS.set(String(chatId), { ...slot, messageId: msgId, lastEdit: Date.now() });
        return;
      }
    } catch (e) {
      try { await bot.answerCallbackQuery(q.id, { text: '⚠️ ' + (e?.message || 'Error') }); } catch {}
    }
  });
}
