// src/commands/guard.js — Guard Mode (hard/soft) + default ON
export default function(bot) {
  bot._guardEnabledDefault = true;         // default global ON
  bot._guardEnabled ||= {};                // por usuario
  bot._guardMode ||= {};                   // 'hard' | 'soft' por usuario

  bot.onText(/^\/guard(?:\s+(on|off|hard|soft))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);
    const arg = (match[1] || '').toLowerCase();

    if (!arg) {
      const enabled = (bot._guardEnabled[uid] !== undefined) ? !!bot._guardEnabled[uid] : !!bot._guardEnabledDefault;
      const mode = bot._guardMode[uid] || 'hard';
      return bot.sendMessage(chatId,
        `🛡️ Guard: ${enabled ? '🟢 ACTIVADO' : '🔴 DESACTIVADO'}\n` +
        `Modo: ${mode === 'hard' ? '🔒 HARD (bloquea)' : '🟡 SOFT (solo avisa)'}\n\n` +
        `Usa: /guard on | /guard off | /guard hard | /guard soft`
      );
    }

    if (arg === 'on')  { bot._guardEnabled[uid] = true;  return bot.sendMessage(chatId, '🛡️ Guard ACTIVADO'); }
    if (arg === 'off') { bot._guardEnabled[uid] = false; return bot.sendMessage(chatId, '🛡️ Guard DESACTIVADO'); }
    if (arg === 'hard'){ bot._guardMode[uid]    = 'hard'; return bot.sendMessage(chatId, '🔒 Guard MODO HARD (bloquea)'); }
    if (arg === 'soft'){ bot._guardMode[uid]    = 'soft'; return bot.sendMessage(chatId, '🟡 Guard MODO SOFT (solo avisa)'); }
  });
}
