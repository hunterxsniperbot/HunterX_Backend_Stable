// src/commands/wallet.js (ESM) — posiciones abiertas con ventas y log en consola, distingue REAL/DEMO

export default (bot, { quickNodeClient, phantomClient }) => {
  bot._walletState ||= {};

  const fmt = (n, d=2) => (n==null || Number.isNaN(n)) ? '–' : Number(n).toFixed(d);
  const dexUrl = (mint, pairUrl) => pairUrl || `https://dexscreener.com/solana/${mint}`;
  const solUrl = (mint) => `https://solscan.io/token/${mint}`;

  async function buildWalletText(uid) {
    const positions = bot._positions?.[uid] || [];
    if (!positions.length) {
      return { text: `📍 *POSICIONES ABIERTAS*\n\nNo tenés posiciones abiertas.`, parseOpts:{parse_mode:'Markdown',disable_web_page_preview:true}, hasButtons:false };
    }
    let out = `📍 *POSICIONES ABIERTAS*\n\n`;
    let idx = 0;
    for (const pos of positions) {
      const mint = pos.mintAddress || pos.mint || pos.tokenMint; if (!mint) continue;
      const symbol = pos.tokenSymbol || (mint.slice(0,4)+'…'+mint.slice(-4));
      const entry = Number(pos.entryPrice || 0);
      const pr = await quickNodeClient.getPrice(mint).catch(()=>null);
      const priceNow = Number(pr?.priceUsd || 0);
      const amountToken = Number(pos.amountToken || 0);
      const investedUsd = entry && amountToken ? entry * amountToken : null;
      const mode = pos.mode || (bot.realMode?.[uid] ? 'REAL' : 'DEMO');
      const modeIcon = mode === 'REAL' ? '🔵' : '🟣';
      let pnlPct = null, pnlUsd = null;
      if (entry && priceNow && amountToken) {
        pnlPct = (priceNow/entry - 1)*100;
        pnlUsd = (priceNow - entry) * amountToken;
      }
      out += `${modeIcon} ${mode} — 🪙 ${symbol}\n`;
      out += `📥 Entrada: ${fmt(entry, 6)}\n`;
      out += `📤 Actual:  ${fmt(priceNow, 6)}\n`;
      out += `💵 Invertido: ${investedUsd ? '$'+fmt(investedUsd,2) : '–'}\n`;
      out += `${pnlPct !== null ? (pnlPct>=0?'📈':'📉') : '📈'} PnL: ${pnlPct!==null?fmt(pnlPct,1)+'%':''} ${pnlUsd!==null?'('+(pnlUsd>=0?'+':'')+fmt(pnlUsd,2)+' USD)':''}\n`;
      out += `[📊 DexScreener](${dexUrl(mint, pos.pairUrl)})  [📎 Solscan](${solUrl(mint)})\n\n`;
      idx++; if (idx >= 10) { out += `…mostrando las 10 primeras posiciones\n\n`; break; }
    }
    return { text: out, parseOpts:{parse_mode:'Markdown',disable_web_page_preview:true}, hasButtons:true };
  }

  function buildKeyboard(positions) {
    const rows = [];
    let idx = 0;
    for (const pos of positions) {
      const mint = pos.mintAddress || pos.mint || pos.tokenMint; if (!mint) continue;
      rows.push([
        { text: '🔁 25%', callback_data: `wallet:sell:${mint}:25` },
        { text: '🔁 50%', callback_data: `wallet:sell:${mint}:50` },
        { text: '🔁 75%', callback_data: `wallet:sell:${mint}:75` },
        { text: '💯 Vender', callback_data: `wallet:sell:${mint}:100` },
      ]);
      idx++; if (idx >= 10) break;
    }
    if (!rows.length) return null;
    return { reply_markup: { inline_keyboard: rows } };
  }

  async function renderOrUpdate(uid, chatId) {
    const positions = bot._positions?.[uid] || [];
    const { text, parseOpts, hasButtons } = await buildWalletText(uid);
    const kb = hasButtons ? buildKeyboard(positions) : null;
    const opts = { ...parseOpts }; if (kb) Object.assign(opts, kb);

    const st = bot._walletState[uid];
    if (st?.msgId) {
      try { await bot.editMessageText(text || '—', { chat_id: chatId, message_id: st.msgId, ...opts }); return; }
      catch { /* reenvía nuevo */ }
    }
    const sent = await bot.sendMessage(chatId, text || '—', opts);
    bot._walletState[uid] = { ...(bot._walletState[uid]||{}), msgId: sent.message_id };
  }

  bot.onText(/^\/wallet\b/, async (msg) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);
    if (bot._walletState?.[uid]?.interval) clearInterval(bot._walletState[uid].interval);
    await renderOrUpdate(uid, chatId);
    const h = setInterval(() => renderOrUpdate(uid, chatId), 5000);
    bot._walletState[uid] = { ...(bot._walletState[uid]||{}), interval: h };
  });

  bot.on('callback_query', async (q) => {
    const data = q.data || '';
    if (!data.startsWith('wallet:sell:')) return;
    const [, , mint, pctStr] = data.split(':');
    const percent = Number(pctStr);
    const uid = String(q.from.id);
    const chatId = q.message.chat.id;

    try {
      const arr = bot._positions?.[uid] || [];
      const pos = arr.find(p => (p.mintAddress||p.mint||p.tokenMint) === mint);
      if (!pos) { await bot.answerCallbackQuery(q.id, { text: 'Posición no encontrada' }); return; }

      const mode = pos.mode || (bot.realMode?.[uid] ? 'REAL' : 'DEMO');
      const modeIcon = mode === 'REAL' ? '🔵' : '🟣';

      let txSell;
      if (bot.demoMode?.[uid] || !phantomClient?.sellToken) {
        txSell = `MOCK_SELL_${Date.now()}`;
      } else {
        txSell = await phantomClient.sellToken({ buyTxSignature: pos.txSignature, mintAddress: mint, percent });
      }

      if (percent >= 100) {
        bot._closedTrades ||= {};
        bot._closedTrades[uid] = bot._closedTrades[uid] || [];
        const pr = await quickNodeClient.getPrice(mint).catch(()=>null);
        const exit = Number(pr?.priceUsd || 0);
        const amountToken = Number(pos.amountToken || 0);
        const invested = (pos.entryPrice && amountToken) ? pos.entryPrice * amountToken : null;
        const pnlUsd = (exit && pos.entryPrice && amountToken) ? (exit - pos.entryPrice) * amountToken : null;

        bot._closedTrades[uid].push({
          token: pos.tokenSymbol || mint,
          entry: pos.entryPrice || null,
          exit,
          invested,
          pnlUsd,
          ts: Date.now(),
          tx: txSell,
          mode, // 👈 guardar modo en histórico local
        });

        // Log y notificación (TOTAL)
        console.log(`[${mode}] Venta TOTAL 100% ${pos.tokenSymbol || mint} tx=${txSell}`);
        await bot.sendMessage(chatId,
          `✅ [${modeIcon} ${mode}] VENTA TOTAL EJECUTADA\n` +
          `🪙 ${pos.tokenSymbol || mint}\n` +
          `TX: ${txSell}`
        );

        // quitar de abiertas
        const i = arr.indexOf(pos); if (i >= 0) arr.splice(i, 1);
      } else {
        const frac = Math.max(0, Math.min(1, percent/100));
        pos.amountToken = Number(pos.amountToken || 0) * (1 - frac);
        pos.soldPct = Array.isArray(pos.soldPct) ? pos.soldPct : [];
        pos.soldPct.push(percent);

        // Log y notificación (PARCIAL)
        console.log(`[${mode}] Venta PARCIAL ${percent}% ${pos.tokenSymbol || mint} tx=${txSell}`);
        await bot.sendMessage(chatId,
          `✅ [${modeIcon} ${mode}] VENTA PARCIAL ${percent}% EJECUTADA\n` +
          `🪙 ${pos.tokenSymbol || mint}\n` +
          `TX: ${txSell}`
        );
      }

      await bot.answerCallbackQuery(q.id, { text: `Venta ${percent}% OK` });
      await renderOrUpdate(uid, chatId);

      // Sheets sólo para ventas 100% (cierres)
      if (percent >= 100) {
        try {
          const { sheetsClient } = await import('../services/sheets.js');
          await sheetsClient.appendClosedTrade({
            uid,
            token: pos.tokenSymbol || mint,
            mint,
            entry: pos.entryPrice || null,
            exit: (await quickNodeClient.getPrice(mint).catch(()=>({priceUsd:null}))).priceUsd || null,
            investedUsd: null, // ya calculado arriba si querés guardarlo
            pnlUsd: null,      // idem
            tx: txSell,
            date: new Date(),
            mode, // 👈 guardar modo en Sheets
          });
          await sheetsClient.renameMonthlySheetWithNet({ date: new Date(), uid });
        } catch (e) {
          console.warn('[Sheets] append/rename error:', e.message);
        }
      }
    } catch (e) {
      await bot.answerCallbackQuery(q.id, { text: `Error: ${e.message}` });
    }
  });

  bot.onText(/^\/stop\b/, (msg) => {
    const uid = String(msg.from.id);
    const st = bot._walletState?.[uid];
    if (st?.interval) clearInterval(st.interval);
    if (bot._walletState?.[uid]) bot._walletState[uid].interval = null;
  });
};
