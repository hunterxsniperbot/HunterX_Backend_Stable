import { runOnce as demoBuy } from '../commands/demoBuyOnce.js';
import { sellAllDemo, getState, resetDemoBank } from '../services/demoBank.js';

const FLAG = Symbol('hxDemoCmds');

function fmtMoney(n){ return Number(n).toFixed(2); }
function fmtQty(n){ return Number(n).toFixed(6); }

export function registerDemoCommands(bot){
  if (bot[FLAG]) return; bot[FLAG] = true;

  bot.onText(/^\/demo_buy(?:\s+(\d+(?:\.\d+)?))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const amount = Math.max(5, Math.min(2000, Number(match?.[1] ?? 20)));
    try {
      const r = await demoBuy({ token: 'SOL', amountUsd: amount });
      const s = r.state;
      const text =
`🟣 DEMO BUY ejecutado
🪙 Token: SOL
💵 Monto: $${fmtMoney(amount)}
💰 Precio: $${fmtMoney(r.priceUsd)}
🔢 Qty: ${fmtQty(r.qty)}

💼 Estado:
• Cash: $${fmtMoney(s.cash)}
• Invested: $${fmtMoney(s.invested)}
• Total: $${fmtMoney(s.total)}
• Posiciones abiertas: ${s.positions.length}`;
      await bot.sendMessage(chatId, text, { disable_web_page_preview: true });
    } catch(e){
      await bot.sendMessage(chatId, '❌ DEMO BUY error: '+ (e?.message||e));
    }
  });

  bot.onText(/^\/demo_sell(?:\s+(\d+(?:\.\d+)?))?(?:\s+([A-Z0-9_]+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const price = Number(match?.[1] ?? 120);
    const token = (match?.[2] ?? 'SOL').toUpperCase();
    try {
      const r = sellAllDemo({ token, priceUsd: price, reason: 'manual' });
      const s = getState();
      const text =
`🟣 DEMO SELL ejecutado
🪙 Token: ${token}
💰 Precio salida: $${fmtMoney(price)}
💸 Realizado (recupero + PnL): $${fmtMoney(r.realizedUsd)}

💼 Estado:
• Cash: $${fmtMoney(s.cash)}
• Invested: $${fmtMoney(s.invested)}
• Total: $${fmtMoney(s.total)}
• Posiciones abiertas: ${s.positions.length}`;
      await bot.sendMessage(chatId, text);
    } catch(e){
      await bot.sendMessage(chatId, '❌ DEMO SELL error: ' + (e?.message||e));
    }
  });

  bot.onText(/^\/demo_state$/i, async (msg) => {
    const chatId = msg.chat.id;
    const s = getState();
    const linesPos = s.positions.map(p =>
      `• ${p.token} qty=${fmtQty(p.qty)} @ $${fmtMoney(p.priceIn)} (USD ${fmtMoney(p.amountUsd)})`
    );
    const text =
`📊 DEMO STATE
Cash: $${fmtMoney(s.cash)} | Invested: $${fmtMoney(s.invested)} | Total: $${fmtMoney(s.total)}
Abiertas: ${s.positions.length}
${linesPos.length ? linesPos.join('\n') : '— sin posiciones —'}`;
    await bot.sendMessage(chatId, text);
  });

  bot.onText(/^\/demo_reset(?:\s+(\d+(?:\.\d+)?))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const seed = Number(match?.[1] ?? 1000);
    resetDemoBank(seed);
    const s = getState();
    await bot.sendMessage(chatId,
      `🔄 DEMO RESET a $${fmtMoney(seed)}\nCash: $${fmtMoney(s.cash)} | Invested: $${fmtMoney(s.invested)} | Total: $${fmtMoney(s.total)}`
    );
  });
}
