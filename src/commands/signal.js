// /signal <mint> <score> — inyecta una señal manual
import { pushSignal } from '../services/feeds.js';

export default function(bot) {
  bot.onText(/^\/signal\s+([A-Za-z0-9]{20,})\s*([\-0-9\.]+)?$/i, async (msg, m) => {
    const chatId = msg.chat.id;
    const mint = m[1];
    const score = Number(m[2] || 1);
    pushSignal({ mint, score, source: 'manual' });
    await bot.sendMessage(chatId, `📡 Señal registrada: ${mint}\nscore= ${score}`);
  });
}
