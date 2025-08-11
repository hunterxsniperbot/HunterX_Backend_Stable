// src/commands/wallet.js
// Wallet en vivo con DEMO y REAL separados, tarjetas por posición con ventas parciales,
// saldo Phantom (REAL) y saldo simulado (DEMO). Anti "message is not modified".

import * as markets from '../services/markets.js';

/* ====== Config ====== */
const REFRESH_MS = Number(process.env.WALLET_REFRESH_MS || 5000);
const DEMO_CASH_DEFAULT = Number(process.env.DEMO_CASH_USD || 1000); // saldo simulado inicial
const DEFAULT_SLIPPAGE = Number(process.env.DEFAULT_SELL_SLIPPAGE || 0.8); // %
/* ==================== */

function fmt2(n) { return (Number.isFinite(n) ? Number(n).toFixed(2) : 'N/D'); }
function short(s) { return s ? (String(s).length > 10 ? String(s).slice(0,6)+'…' : String(s)) : '—'; }
const ok = '✅', bad = '❌';

/** Construye teclado de acciones para UNA posición */
function buildCardKeyboard({ mode, mint, symbol }) {
  const sellRow = [
    { text: '💠 25%', callback_data: `WSELL|${mode}|${mint}|25` },
    { text: '💠 50%', callback_data: `WSELL|${mode}|${mint}|50` },
    { text: '💠 75%', callback_data: `WSELL|${mode}|${mint}|75` },
    { text: '💯 Vender', callback_data: `WSELL|${mode}|${mint}|100` },
  ];
  const linksRow = [
    { text: '📊 DexScreener', url: `https://dexscreener.com/solana/${mint}` },
    { text: '🔗 Solscan',     url: `https://solscan.io/token/${mint}` },
  ];
  return { inline_keyboard: [ sellRow, linksRow ] };
}

/** Texto para UNA posición */
function cardText({ mode, p, priceNow }) {
  const sym   = p.symbol || p.tokenSymbol || short(p.mint);
  const entry = Number(p.avg || p.entryPrice || 0);
  const qty   = Number(p.qty || p.amountToken || 0);
  const now   = Number(priceNow ?? NaN);

  const head = `🗂️ *Posición (${mode})*\n\n🌐 ${short(sym)}`;
  if (!Number.isFinite(entry) || !entry || !qty || !Number.isFinite(now)) {
    return head + `\n📥 Entrada: –\n📤 Actual: ${Number.isFinite(now) ? now : '—'}\n💵 Invertido: –\n📈 PnL: –`;
  }

  const invUsd = entry * qty;
  const curUsd = now * qty;
  const pnlUsd = curUsd - invUsd;
  const pnlPct = invUsd ? (pnlUsd / invUsd) * 100 : 0;
  const sign   = pnlUsd >= 0 ? '+' : '';

  return (
    `${head}\n` +
    `📥 Entrada: ${entry}\n` +
    `📤 Actual: ${now}\n` +
    `💵 Invertido: $${fmt2(invUsd)}\n` +
    `📈 PnL: ${sign}${fmt2(pnlPct)}% (${sign}$${fmt2(pnlUsd)})`
  );
}

/** Texto del RESUMEN (cabecera) */
function summaryText({ demoCnt, realCnt, demoInv, realInv, demoFree, realFree, havePhantom, addr }) {
  return (
`💼 *Posiciones abiertas*
• DEMO: ${demoCnt}
• REAL: ${realCnt}
• Total: ${demoCnt + realCnt}

💳 *Phantom Wallet (REAL)*
${havePhantom ? `• Address: \`${addr}\`` : '• Address: —'}
• Invertido: $${fmt2(realInv)}
• Libre para sniper: $${fmt2(realFree)}

🧪 *Billetera DEMO*
• Invertido: $${fmt2(demoInv)}
• Libre para sniper: $${fmt2(demoFree)}`
  );
}

/** busca posición por mint en un store */
function findPosByMint(store, mint) {
  const i = store.findIndex(z => (z.mint || z.mintAddress || z.tokenMint) === mint);
  return { i, p: i >= 0 ? store[i] : null };
}

/** reduce cantidad (DEM0/REAL) tras venta */
function dropQty(store, mint, qty) {
  const { i, p } = findPosByMint(store, mint);
  if (i < 0 || !p) return;
  const newQty = Math.max(0, Number(p.qty || p.amountToken || 0) - qty);
  if (newQty <= 0) {
    store.splice(i, 1);
  } else {
    // mantener avg, bajar qty
    p.qty = newQty;
  }
}

export default function registerWallet(bot, { quickNodeClient, phantomClient, trading }) {
  // Estados por usuario
  bot._walletLoops      = bot._walletLoops      || {};
  bot._walletSummary    = bot._walletSummary    || {}; // {chatId, messageId}
  bot._walletCards      = bot._walletCards      || {}; // uid -> mint -> {chatId, messageId}
  bot._walletCache      = bot._walletCache      || {}; // key -> lastText
  bot._demoCashCfg      = bot._demoCashCfg      || {}; // uid -> saldo inicial deseado (opcional)

  /* ========= Handler /wallet ========= */
  bot.onText(/^\/wallet$/, async (msg) => {
    const uid    = String(msg.from.id);
    const chatId = msg.chat.id;

    // limpiar ciclo anterior + tarjetas antiguas
    if (bot._walletLoops[uid]) {
      clearInterval(bot._walletLoops[uid]);
      delete bot._walletLoops[uid];
    }
    if (bot._walletSummary[uid]) {
      // dejamos que se edite en su lugar (no borramos)
    }
    // mapa de tarjetas por mint
    bot._walletCards[uid] = bot._walletCards[uid] || {};

    // enviar/asegurar resumen
    if (!bot._walletSummary[uid]) {
      const first = await bot.sendMessage(chatId, '_cargando…_', { parse_mode: 'Markdown' });
      bot._walletSummary[uid] = { chatId, messageId: first.message_id };
    }

    // loop de refresco
    bot._walletLoops[uid] = setInterval(async () => {
      try {
        await renderWallet(bot, uid, { quickNodeClient });
      } catch (e) {
        console.error('[wallet] loop error:', e?.message || e);
      }
    }, REFRESH_MS);

    // primer render inmediato
    await renderWallet(bot, uid, { quickNodeClient });
  });

  /* ========= Ventas parciales (callback) ========= */
  bot.on('callback_query', async (q) => {
    try {
      const data = String(q.data || '');
      if (!data.startsWith('WSELL|')) return;

      const [, mode, mint, pctStr] = data.split('|'); // WSELL|DEMO|<mint>|50
      const uid = String(q.from.id);
      const pct = Math.max(1, Math.min(100, Number(pctStr || 0)));
      const isDemo = (mode === 'DEMO');

      const store = isDemo ? (bot._positions_demo?.[uid] || []) : (bot._positions_real?.[uid] || []);
      const { p } = findPosByMint(store, mint);
      if (!p) {
        await bot.answerCallbackQuery(q.id, { text: 'Posición no encontrada', show_alert: true });
        return;
      }

      const qty = Number(p.qty || p.amountToken || 0);
      const sellQty = Math.max(0, qty * (pct / 100));
      if (sellQty <= 0) {
        await bot.answerCallbackQuery(q.id, { text: 'Cantidad cero', show_alert: false });
        return;
      }

      // precio actual
      let priceNow = null;
      try { priceNow = await quickNodeClient?.getPrice?.(mint || p.symbol); } catch {}
      priceNow = Number(priceNow || 0);

      // ejecutar venta
      if (isDemo) {
        // DEMO: simulado, sólo bajamos qty y logueamos
        dropQty(store, mint, sellQty);
        bot._positions_demo[uid] = store; // persistir en memoria

        await trading?.logTrade?.({
          mode: 'DEMO',
          type: 'sell',
          token: p.symbol || short(mint),
          mint,
          salida_usd: priceNow,
          inversion_usd: (Number(p.avg || p.entryPrice || 0) * sellQty),
          pnl_usd: ((priceNow - Number(p.avg || 0)) * sellQty),
          pnl_pct: null,
          fuente: 'wallet_partial',
          extra: { pct, simulated: true }
        });

        await bot.answerCallbackQuery(q.id, { text: `DEMO: vendido ${pct}%`, show_alert: false });
      } else {
        // REAL: Phantom
        const resp = await phantomClient?.sellToken?.({
          mint,
          amountToken: sellQty,
          slippagePct: DEFAULT_SLIPPAGE
        }).catch(e => ({ ok: false, error: e?.message || String(e) }));

        if (!resp?.ok) {
          await bot.answerCallbackQuery(q.id, { text: `REAL: error al vender (${resp?.error || 'desconocido'})`, show_alert: true });
          return;
        }

        dropQty(store, mint, sellQty);
        bot._positions_real[uid] = store;

        await trading?.logTrade?.({
          mode: 'REAL',
          type: 'sell',
          token: p.symbol || short(mint),
          mint,
          salida_usd: priceNow,
          inversion_usd: (Number(p.avg || p.entryPrice || 0) * sellQty),
          pnl_usd: ((priceNow - Number(p.avg || 0)) * sellQty),
          pnl_pct: null,
          fuente: 'wallet_partial',
          extra: { pct, txid: resp?.txid || null }
        });

        await bot.answerCallbackQuery(q.id, { text: `REAL: vendido ${pct}%`, show_alert: false });
      }

      // forzar un render después de la venta
      await renderWallet(bot, String(q.from.id), { quickNodeClient });
    } catch (e) {
      console.error('[wallet] callback error:', e?.message || e);
      try { await bot.answerCallbackQuery(q.id, { text: 'Error interno', show_alert: true }); } catch {}
    }
  });
}

/* ========= Render principal ========= */
async function renderWallet(bot, uid, { quickNodeClient }) {
  const demoStore = bot._positions_demo?.[uid] || [];
  const realStore = bot._positions_real?.[uid] || [];

  // ——— precios actuales por mint (cache liviano por tick) ———
  const priceMap = {};
  async function priceOf(p) {
    const mint = p.mint || p.mintAddress || p.tokenMint || p.symbol;
    if (priceMap[mint] !== undefined) return priceMap[mint];
    let v = null;
    try { v = await quickNodeClient?.getPrice?.(mint); } catch {}
    priceMap[mint] = Number(v || 0);
    return priceMap[mint];
  }

  // ——— inversiones y totales DEMO/REAL ———
  let demoInv = 0, realInv = 0;

  for (const p of demoStore) {
    const entry = Number(p.avg || p.entryPrice || 0);
    const qty   = Number(p.qty || p.amountToken || 0);
    demoInv += entry * qty;
  }
  for (const p of realStore) {
    const entry = Number(p.avg || p.entryPrice || 0);
    const qty   = Number(p.qty || p.amountToken || 0);
    realInv += entry * qty;
  }

  // ——— Saldos: REAL (Phantom) y DEMO (simulado) ———
  const realAddr = process.env.PHANTOM_PUBLIC_ADDRESS || null;
  let realAvail = null;
  if (realAddr && quickNodeClient?.getSolBalance) {
    try {
      const sol = await quickNodeClient.getSolBalance(realAddr);
      const solUsd = await markets.getSolUsd();
      realAvail = (Number(sol || 0) * Number(solUsd || 0));
    } catch {}
  }

  const demoBase = bot._demoCashCfg?.[uid] ?? DEMO_CASH_DEFAULT;
  const demoAvail = Math.max(0, demoBase - demoInv);

  // ——— actualizar RESUMEN ———
  const summary = bot._walletSummary[uid];
  if (summary) {
    const sText = summaryText({
      demoCnt: demoStore.length,
      realCnt: realStore.length,
      demoInv,
      realInv,
      demoFree: demoAvail,
      realFree: realAvail != null ? Math.max(0, realAvail - realInv) : null,
      havePhantom: !!realAddr,
      addr: realAddr || '—'
    });

    const sKey = `${summary.chatId}:${summary.messageId}`;
    const last = bot._walletCache[sKey];
    if (last !== sText) {
      try {
        await bot.editMessageText(sText, {
          chat_id: summary.chatId,
          message_id: summary.messageId,
          parse_mode: 'Markdown'
        });
        bot._walletCache[sKey] = sText;
      } catch (e) {
        const m = String(e?.message || e);
        if (!m.includes('message is not modified')) {
          console.error('[wallet] summary edit error:', m);
        }
      }
    }
  }

  // ——— render TARJETAS DEMO ———
  await renderCardsForMode({
    bot, uid, mode: 'DEMO', store: demoStore, quickNodeClient, priceOf
  });

  // ——— render TARJETAS REAL ———
  await renderCardsForMode({
    bot, uid, mode: 'REAL', store: realStore, quickNodeClient, priceOf
  });
}

async function renderCardsForMode({ bot, uid, mode, store, quickNodeClient, priceOf }) {
  const chatId = bot._walletSummary[uid]?.chatId;
  if (!chatId) return;

  bot._walletCards[uid] = bot._walletCards[uid] || {};
  const cards = bot._walletCards[uid];

  // set de mints actuales (para detectar borrados)
  const currentMints = new Set(store.map(p => p.mint || p.mintAddress || p.tokenMint));

  // actualizar/crear tarjetas
  for (const p of store) {
    const mint = p.mint || p.mintAddress || p.tokenMint;
    const symbol = p.symbol || p.tokenSymbol || short(mint);
    const priceNow = await priceOf(p);

    const text = cardText({ mode, p, priceNow });
    const markup = buildCardKeyboard({ mode, mint, symbol });
    const key = `${uid}:${mode}:${mint}`;
    const cached = bot._walletCache[key];

    // si no existe tarjeta, crear
    if (!cards[`${mode}:${mint}`]) {
      try {
        const sent = await bot.sendMessage(chatId, text, {
          parse_mode: 'Markdown',
          reply_markup: markup
        });
        cards[`${mode}:${mint}`] = { chatId, messageId: sent.message_id };
        bot._walletCache[key] = text;
      } catch (e) {
        console.error('[wallet] send card error:', e?.message || e);
      }
      continue;
    }

    // editar si cambió
    if (cached !== text) {
      try {
        await bot.editMessageText(text, {
          chat_id: cards[`${mode}:${mint}`].chatId,
          message_id: cards[`${mode}:${mint}`].messageId,
          parse_mode: 'Markdown',
          reply_markup: markup
        });
        bot._walletCache[key] = text;
      } catch (e) {
        const m = String(e?.message || e);
        if (!m.includes('message is not modified')) {
          console.error('[wallet] edit card error:', m);
        }
      }
    }
  }

  // borrar tarjetas de posiciones que ya no están
  for (const key of Object.keys(cards)) {
    const [m, mint] = key.includes(':') ? [key.split(':')[0], key.split(':')[1]] : [null, null];
    if (!key.startsWith(`${mode}:`)) continue;
    if (!currentMints.has(mint)) {
      // position removed -> intentar borrar tarjeta
      try {
        const msgRef = cards[key];
        if (msgRef) {
          await bot.editMessageText('🗑️ *Posición cerrada*', {
            chat_id: msgRef.chatId,
            message_id: msgRef.messageId,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] }
          }).catch(() => {});
        }
      } catch {}
      delete cards[key];
    }
  }
}
