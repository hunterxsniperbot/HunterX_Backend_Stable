// src/commands/signals.js — muestra señales externas acumuladas (feeds.js)
import { dumpSignals } from '../services/feeds.js';

export default function(bot) {
  bot.onText(/^\/signals$/i, async (msg) => {
    const chatId = msg.chat.id;
    const arr = dumpSignals();
    if (!arr.length) return bot.sendMessage(chatId, '📡 Sin señales activas.');
    const top = arr.slice(0, 12).map((x, i) => {
      const ageMin = ((Date.now() - x.ts) / 60000).toFixed(1);
      return `${i+1}. ${x.mint}\n   score=${x.score.toFixed(2)} • ${ageMin}m • ${x.source || 'n/a'}`;
    }).join('\n');
    await bot.sendMessage(chatId, `📡 *Señales activas (top)*\n\n${top}`, { parse_mode: 'Markdown' });
  });
}
