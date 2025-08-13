// src/commands/mode.js — alterna modo REAL/DEMO por usuario (persistente si hay state)
import * as state from '../services/state.js';

export default function registerMode(bot) {
  bot.realMode = bot.realMode || {};

  // Cargar persistido (si existe)
  try {
    state.getRealModeMap?.()
      .then(map => { if (map && typeof map === 'object') bot.realMode = { ...bot.realMode, ...map }; })
      .catch(() => {});
  } catch {}

  // /real — activa modo REAL
  bot.removeTextListener?.(/^\s*\/real\s*$/i);
  bot.onText(/^\s*\/real\s*$/i, async (msg) => {
    const uid = String(msg.from.id);
    const chatId = msg.chat.id;
    bot.realMode[uid] = true;
    state.setRealMode?.(uid, true).catch(()=>{});
    const note = bot._sniperOn?.[uid] ? ' <i>(Sniper ON: se aplica a nuevas entradas)</i>' : '';
    return bot.sendMessage(chatId, '⚡ <b>Modo REAL activado</b>' + note, { parse_mode: 'HTML' });
  });

  // /demo — activa modo DEMO
  bot.removeTextListener?.(/^\s*\/demo\s*$/i);
  bot.onText(/^\s*\/demo\s*$/i, async (msg) => {
    const uid = String(msg.from.id);
    const chatId = msg.chat.id;
    bot.realMode[uid] = false;
    state.setRealMode?.(uid, false).catch(()=>{});
    const note = bot._sniperOn?.[uid] ? ' <i>(Sniper ON: se aplica a nuevas entradas)</i>' : '';
    return bot.sendMessage(chatId, '🧪 <b>Modo DEMO activado</b>' + note, { parse_mode: 'HTML' });
  });

  console.log('✅ Handler cargado: mode.js');
}
