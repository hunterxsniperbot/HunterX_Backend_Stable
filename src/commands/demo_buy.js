// /demobuy <SIMBOLO> <USD>
// ej: /demobuy SOLBOMB 1000
import { loadState, saveState } from '../services/state_compat.js';

export default function registerDemoBuy(bot) {
  bot.onText(/^\/demo(?:_)?buy(?:@.+)?\s+([A-Za-z0-9_.$-]{1,16})\s+([0-9]+(?:\.[0-9]+)?)$/i, async (msg, m) => {
    const chatId = msg.chat.id;
    const symbol = String(m[1]).toUpperCase();
    const investedUsd = Number(m[2]);

    const st = loadState();
    st.positions = st.positions || {};
    st.positions.demo = st.positions.demo || [];
    st.demo = st.demo || {};
    // si no hay cash demo, lo inicializamos a 10k - sum(invertido abierto)
    if (typeof st.demo.cash !== 'number') {
      const sumInv = st.positions.demo.filter(p=>p.isOpen!==false)
        .reduce((a,p)=>a+Number(p.investedUsd||0),0);
      st.demo.cash = Math.max(0, 10_000 - sumInv);
    }
    if (st.demo.cash < investedUsd) {
      await bot.sendMessage(chatId, `❌ DEMO: saldo insuficiente. Cash: $${st.demo.cash.toFixed(2)}`);
      return;
    }

    const now = Date.now();
    const mint = 'So11111111111111111111111111111111111111112'; // placeholder
    const pos = {
      id: `demo-${now}`,
      mint,
      symbol,
      entryPriceUsd: 0.0032,
      investedUsd,
      originalUsd: investedUsd,  // <-- tamaño inicial
      openedAt: now,
      mode: 'demo',
      isOpen: true,
      status: 'open',
    };
    st.positions.demo.push(pos);
    st.demo.cash = Number((st.demo.cash - investedUsd).toFixed(2));
    saveState(st);

    await bot.sendMessage(chatId, `✅ DEMO buy: $${symbol} por $${investedUsd.toFixed(2)}. Cash: $${st.demo.cash.toFixed(2)}. Probá /wallet`);
  });
}
