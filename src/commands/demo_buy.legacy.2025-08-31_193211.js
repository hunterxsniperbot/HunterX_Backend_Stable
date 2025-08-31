import { loadState, saveState } from '../services/state_compat.js';
import { getPriceUSD } from '../services/prices.js';

export default function registerDemoBuy(bot){
  bot.onText(/^\/demobuy(?:@[\w_]+)?\s+([A-Za-z0-9_\-\.]{1,20})\s+([0-9]+(?:\.[0-9]+)?)$/, async (msg, m) => {
    const chatId = msg.chat.id;
    const symbol = String(m[1] || 'TOKEN').toUpperCase().slice(0, 20);
    const investedUsd = Math.max(1, Number(m[2] || 0));

    // Para demo: si no pasás mint, usamos WSOL como “proxy de precio”
    const mint = 'So11111111111111111111111111111111111111112';

    let priceNow = 0;
    try { const r = await getPriceUSD(mint); priceNow = Number(r?.price || r || 0); } catch {}
    if (priceNow <= 0) return bot.sendMessage(chatId, '❌ No pude obtener precio para demo.').catch(()=>{});

    const st = loadState();
    // verificar cash demo
    if (st.demo.cash < investedUsd) {
      return bot.sendMessage(chatId, `❌ DEMO: saldo insuficiente. Libre: $${st.demo.cash.toFixed(2)}`).catch(()=>{});
    }

    const now = Date.now();
    const pos = {
      id: `demo-${now}`,
      mint,
      symbol,
      entryPriceUsd: priceNow,   // ← precio real del momento
      investedUsd,
      openedAt: now,
      mode: 'demo',
      isOpen: true,
      status: 'open'
    };

    st.positions.demo.push(pos);
    st.demo.cash = Number(st.demo.cash || 0) - investedUsd;
    saveState(st);

    bot.sendMessage(chatId, `✅ DEMO BUY: ${symbol} por $${investedUsd.toFixed(2)} (entry $${priceNow.toFixed(4)}). Probá /wallet`).catch(()=>{});
  });
}
