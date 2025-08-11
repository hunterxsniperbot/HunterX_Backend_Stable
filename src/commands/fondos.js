// src/commands/fondos.js — administra saldo DEMO
import demoBank from '../services/demoBank.js';

export default function registerFondos(bot) {
  bot.onText(/^\/fondos(?:\s+(\d+(?:[.,]\d+)?))?$/i, async (msg, m) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);
    if (!m[1]) {
      const cur = demoBank.get(uid);
      return bot.sendMessage(chatId, `💳 Saldo DEMO actual: $${cur.toFixed(2)}`);
    }
    const val = Number(String(m[1]).replace(',', '.'));
    if (!Number.isFinite(val) || val < 0) {
      return bot.sendMessage(chatId, `❌ Valor inválido.`);
    }
    const now = demoBank.set(uid, val);
    return bot.sendMessage(chatId, `✅ Saldo DEMO seteado en $${now.toFixed(2)}`);
  });

  bot.onText(/^\/depositar\s+(\d+(?:[.,]\d+)?)$/i, async (msg, m) => {
    const chatId = msg.chat.id, uid = String(msg.from.id);
    const val = Number(String(m[1]).replace(',', '.'));
    const now = demoBank.add(uid, val);
    bot.sendMessage(chatId, `➕ Depositaste $${val.toFixed(2)}. Nuevo saldo DEMO: $${now.toFixed(2)}`);
  });

  bot.onText(/^\/retirar\s+(\d+(?:[.,]\d+)?)$/i, async (msg, m) => {
    const chatId = msg.chat.id, uid = String(msg.from.id);
    const val = Number(String(m[1]).replace(',', '.'));
    const now = demoBank.sub(uid, val);
    bot.sendMessage(chatId, `➖ Retiraste $${val.toFixed(2)}. Nuevo saldo DEMO: $${now.toFixed(2)}`);
  });

  bot.onText(/^\/reset_fondos(?:\s+(\d+(?:[.,]\d+)?))?$/i, async (msg, m) => {
    const chatId = msg.chat.id, uid = String(msg.from.id);
    const to = m[1] ? Number(String(m[1]).replace(',', '.')) : null;
    const now = demoBank.reset(uid, to);
    bot.sendMessage(chatId, `🔁 Saldo DEMO reseteado: $${now.toFixed(2)}`);
  });
}
