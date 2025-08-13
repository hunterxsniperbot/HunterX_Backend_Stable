// src/commands/status.js
export default function registerStatus(bot) {
  bot.removeTextListener?.(/^\/status(?:@[\w_]+)?$/i);
  bot.onText(/^\/status(?:@[\w_]+)?\s*$/i, async (msg) => {
    const chatId = msg.chat.id;
    const uid  = String(msg.from.id);
    const on   = !!bot._sniperOn?.[uid];
    const mode = bot.realMode?.[uid] ? 'REAL' : 'DEMO';
    const loop = bot._sniperLoops?.[uid] ? 'activo' : 'apagado';
    const running = bot._running?.[uid] ? 'sí' : 'no';

    const lines = [
      '<b>📊 Status</b>',
      '• Sniper: ' + (on ? '<b>ON</b>' : '<b>OFF</b>'),
      '• Loop: ' + loop + ' (running: ' + running + ')',
      '• Modo: <b>' + mode + '</b>',
    ];
    return bot.sendMessage(chatId, lines.join('\n'), { parse_mode:'HTML' });
  });
  console.log('✅ Handler cargado: status.js');
}
