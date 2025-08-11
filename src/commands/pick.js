// src/commands/pick.js — /pick <mint|simbolo|par> [montoUSD] [slippage%]
import * as markets from '../services/markets.js';
import trading from '../services/trading.js';

export default function registerPick(bot, { phantomClient }) {
  // Soporta:
  // /pick SOL
  // /pick SOL/USDT
  // /pick SOL/USDC
  // /pick <MINT> 25 0.5
  const re = /^\/pick\s+([A-Za-z0-9/]+)\s*([\d.]+)?\s*([\d.]+%?)?$/i;

  bot.onText(re, async (msg, m) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);

    const qInput      = (m[1] || '').trim();
    const amountUsd   = Number(m[2] || 25);
    const slipIn      = (m[3] || '').trim();
    const slippagePct = slipIn ? Number(String(slipIn).replace('%','')) : 0.5;

    try {
      // Resolver (par/símbolo → mint) vía DexScreener si no parece mint
      let tokenInfo = null;
      const looksLikeMint = (s) => s && s.length >= 32 && s.length <= 64 && !s.includes('/');

      if (looksLikeMint(qInput)) {
        tokenInfo = { mint: qInput, symbol: qInput.slice(0,6)+'…', priceUsd: null, url: null, metrics: {} };
      } else {
        const info = await markets.getTokenInfoFromPair(qInput);
        if (!info || !info.mint) {
          await bot.sendMessage(chatId, `❌ No pude resolver \`${qInput}\` en DexScreener`, { parse_mode: 'Markdown' });
          return;
        }
        tokenInfo = info;
      }

      const res = await trading.executePick(uid, tokenInfo, amountUsd, slippagePct, { bot, phantomClient });
      await bot.sendMessage(chatId, res.message, { parse_mode: 'Markdown' });

    } catch (err) {
      console.error('[pick] error:', err);
      await bot.sendMessage(chatId, `⚠️ Error en /pick: ${err?.message || err}`);
    }
  });
}
