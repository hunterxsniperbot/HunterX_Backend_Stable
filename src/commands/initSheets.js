// src/commands/initSheets.js
export default function registerInitSheets(bot) {
  bot.removeTextListener?.(/^\/init_sheets(?:@[\w_]+)?/i);

  bot.onText(/^\/init_sheets(?:@[\w_]+)?\s+(\S+)\s+(\S+)\s*$/i, (msg, m) => {
    const chatId = msg.chat.id;
    const demo = m[1], real = m[2];
    bot._sheetsTabs = { demo, real };
    const text = [
      '<b>✅ Sheets configurado</b>',
      '• DEMO_TAB: <code>' + demo + '</code>',
      '• REAL_TAB: <code>' + real + '</code>',
    ].join('\n');
    return bot.sendMessage(chatId, text, { parse_mode:'HTML' });
  });

  bot.onText(/^\/init_sheets(?:@[\w_]+)?\s*$/i, (msg) => {
    return bot.sendMessage(msg.chat.id, 'Uso: <code>/init_sheets DEMO_TAB REAL_TAB</code>', { parse_mode:'HTML' });
  });

  console.log('✅ Handler cargado: initSheets.js');
}
