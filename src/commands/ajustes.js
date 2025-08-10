// src/commands/ajustes.js
export default (bot) => {
  bot.sniperConfig ||= {}; bot._awaitingMonto ||= {};
  bot.onText(/^\/ajustes\b/, async (msg) => {
    const uid = msg.from.id, cfg = bot.sniperConfig[uid] || { monto: 100 };
    const kb = { reply_markup:{ inline_keyboard:[[{ text:'💰 Cambiar monto', callback_data:'ajustes:monto' }]]}, parse_mode:'Markdown' };
    await bot.sendMessage(msg.chat.id, `⚙️ *Ajustes del Sniper*\n\n💰 Monto: *$${cfg.monto}*`, kb);
  });
  bot.on('callback_query', async (q) => {
    if (q.data !== 'ajustes:monto') return;
    bot._awaitingMonto[q.from.id] = true;
    await bot.sendMessage(q.message.chat.id, 'Enviá el *nuevo monto* en USD:', { parse_mode:'Markdown' });
  });
  bot.on('message', async (msg) => {
    const uid = msg.from?.id; if (!uid || !bot._awaitingMonto[uid]) return;
    const v = Number(String(msg.text||'').replace(',','.')); if (!isFinite(v) || v<=0) return bot.sendMessage(msg.chat.id,'⚠️ Valor inválido.');
    bot.sniperConfig[uid] = { ...(bot.sniperConfig[uid]||{}), monto: Math.round(v*100)/100 };
    bot._awaitingMonto[uid] = false;
    await bot.sendMessage(msg.chat.id, `✅ Monto actualizado: *$${bot.sniperConfig[uid].monto}*`, { parse_mode:'Markdown' });
  });
};
