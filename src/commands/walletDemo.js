// src/commands/walletDemo.js — render de posiciones demo con callbacks reales
import { getPriceUSD } from '../services/prices.js';

function fmtUSD(n){ return '$' + (Number(n||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }

function cardHtml({ sym, entry, now, qty }) {
  const invested = entry * qty;
  const curr     = now   * qty;
  const pnlAbs   = curr - invested;
  const pnlPct   = invested > 0 ? (pnlAbs / invested) * 100 : 0;
  const arrow    = pnlPct >= 0 ? '📈' : '📉';
  const name     = sym.startsWith('$') ? sym : ('$' + sym);
  return [
    `🪙 <b>${name}</b>`,
    `📥 Entrada: ${entry.toFixed(6)} USD`,
    `📤 Actual: ${now.toFixed(6)} USD`,
    `📦 Qty: ${qty}`,
    `💵 Invertido: ${fmtUSD(invested)}`,
    `${arrow} PnL: <b>${pnlPct.toFixed(2)}%</b> (${fmtUSD(pnlAbs)})`
  ].join('\n');
}

function kbFor({ sym, qty }) {
  const enc = encodeURIComponent(sym);
  // callback_data = wallet:<action>:<pct>:<MODE>:<symbol>:<mint?>:<qty?>
  const baseSell  = `wallet:sell:%PCT%:DEMO:${enc}::${qty}`;
  const quote100  = `wallet:quote:100:DEMO:${enc}::${qty}`;
  return {
    inline_keyboard: [
      [
        { text:'🔁 25%', callback_data: baseSell.replace('%PCT%','25') },
        { text:'🔁 50%', callback_data: baseSell.replace('%PCT%','50') },
        { text:'🔁 75%', callback_data: baseSell.replace('%PCT%','75') },
        { text:'💯 Vender', callback_data: baseSell.replace('%PCT%','100') },
      ],
      [
        { text:'📐 Cotizar 100%', callback_data: quote100 },
      ]
    ]
  };
}

export default function registerWalletDemo(bot){
  bot.onText(/^\s*\/wallet_demo\s*$/i, async (msg) => {
    const chatId = msg.chat.id;
    try {
      // Dos posiciones demo: SOL y BONK
      const pSOL = await getPriceUSD('SOL');
      const pBONK = await getPriceUSD('BONK'); // si no hay precio, cae a NaN y mostramos sólo SOL
      const cards = [];

      // SOL: entrada 10% por debajo del precio actual, qty 1.5
      if (Number.isFinite(pSOL)) {
        const pos = { sym:'SOL', entry: pSOL*0.90, now: pSOL, qty: 1.5 };
        cards.push({ html: cardHtml(pos), kb: kbFor({ sym: pos.sym, qty: pos.qty }) });
      }
      // BONK: entrada 15% por encima (para PnL negativo), qty 1e6
      if (Number.isFinite(pBONK)) {
        const pos = { sym:'BONK', entry: pBONK*1.15, now: pBONK, qty: 1_000_000 };
        cards.push({ html: cardHtml(pos), kb: kbFor({ sym: pos.sym, qty: pos.qty }) });
      }

      if (cards.length === 0) {
        return bot.sendMessage(chatId, '⚠️ No pude obtener precios demo (prueba más tarde).', { parse_mode:'HTML' });
      }

      await bot.sendMessage(chatId, '<b>📱 Posiciones DEMO (mostrar & probar botones)</b>', { parse_mode:'HTML' });
      for (const c of cards) {
        await bot.sendMessage(chatId, c.html, { parse_mode:'HTML', reply_markup: c.kb });
      }
    } catch (e) {
      console.error('wallet_demo error:', e?.message || e);
      return bot.sendMessage(chatId, '⚠️ Error al generar demo.', { parse_mode:'HTML' });
    }
  });

  console.log('✅ Handler cargado: walletDemo.js');
}
