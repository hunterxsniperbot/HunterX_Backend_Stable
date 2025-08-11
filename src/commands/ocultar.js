// src/commands/ocultar.js — oculta el teclado persistente
export default function registerOcultar(bot) {
  bot.onText(/^\/(ocultar|hide|teclado_off)\b/i, async (msg) => {
    try {
      await bot.sendMessage(msg.chat.id, '✅ Menú ocultado', {
        reply_markup: { remove_keyboard: true }
      });
    } catch (e) {
      console.error('[ocultar]', e?.message || e);
    }
  });
}
