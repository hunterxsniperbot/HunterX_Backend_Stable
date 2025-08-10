// src/commands/demo.js
export default function registerDemo(bot) {
  // Asegura los mapas globales (por si el bot se inicializó sin ellos)
  bot.demoMode = bot.demoMode || {};
  bot.realMode = bot.realMode || {};

  // /demo → activa solo DEMO
  bot.onText(/\/demo/, async (msg) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);

    const wasDemo = !!bot.demoMode[uid];
    bot.demoMode[uid] = true;
    bot.realMode[uid] = false;

    if (wasDemo) {
      await bot.sendMessage(
        chatId,
        '🟣 Modo *DEMO* ya estaba activo.',
        { parse_mode: 'Markdown' }
      );
    } else {
      await bot.sendMessage(
        chatId,
        '🟣 Modo *DEMO* activado. Todos los trades son simulados.',
        { parse_mode: 'Markdown' }
      );
    }
  });

  // /real → activa solo REAL
  bot.onText(/\/real/, async (msg) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);

    const wasReal = !!bot.realMode[uid];
    bot.realMode[uid] = true;
    bot.demoMode[uid] = false;

    if (wasReal) {
      await bot.sendMessage(
        chatId,
        '🔵 Modo *REAL* ya estaba activo.',
        { parse_mode: 'Markdown' }
      );
    } else {
      await bot.sendMessage(
        chatId,
        '🔵 Modo *REAL* activado. Se ejecutarán trades reales.',
        { parse_mode: 'Markdown' }
      );
    }
  });

  // /status (alias /modo /mode) → muestra el modo actual
  bot.onText(/\/status|\/modo|\/mode/, async (msg) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);

    const demo = !!bot.demoMode[uid];
    const real = !!bot.realMode[uid];

    let text;
    if (demo) text = '🟣 *DEMO* activo (simulación).';
    else if (real) text = '🔵 *REAL* activo (operaciones reales).';
    else text = '⚪ Ningún modo activo. Usa /demo o /real.';

    await bot.sendMessage(chatId, `Estado de modo: ${text}`, { parse_mode: 'Markdown' });
  });
}
