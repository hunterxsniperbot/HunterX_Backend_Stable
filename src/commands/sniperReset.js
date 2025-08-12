function htmlEscape(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}
// src/commands/sniperReset.js
// Resetea el estado del Sniper para el usuario: apaga, limpia intervalos/stores/risk y persiste OFF.

import * as state from '../services/state.js';
// Escapar HTML para parse_mode:"HTML"

export default function registerSniperReset(bot) {
  // Variantes aceptadas
  const patterns = [
    /^\s*\/sniperreset\s*$/i,
    /^\s*\/sniper_reset\s*$/i,
    /^\s*\/reset_sniper\s*$/i,
  ];

  for (const re of patterns) {
    bot.onText(re, async (msg) => {
      const chatId = msg.chat.id;
      const uid    = String(msg.from.id);

      try {
        // Apagar y limpiar intervalos del autosniper para este user
        if (bot._sniperLoops?.[uid]) {
          clearInterval(bot._sniperLoops[uid]);
          delete bot._sniperLoops[uid];
        }

        // Marcar OFF y limpiar “running”
        if (bot._sniperOn) bot._sniperOn[uid] = false;
        if (bot._running && bot._running[uid]) delete bot._running[uid];

        // Limpiar stores DEMO/REAL y risk
        if (bot._store_demo && bot._store_demo[uid]) delete bot._store_demo[uid];
        if (bot._store_real && bot._store_real[uid]) delete bot._store_real[uid];
        if (bot._risk && bot._risk[uid]) delete bot._risk[uid];

        // Persistencia OFF
        state.setSniperOn?.(uid, false).catch(()=>{});

        // Responder
          return bot.sendMessage(chatId, '<b>♻️ Reset de Sniper hecho</b>. Estado: <b>OFF</b> (persistido).', { parse_mode:'HTML' });
      } catch (e) {
          return bot.sendMessage(chatId, '⚠️ No se pudo completar el reset: <code>' + htmlEscape(String(e?.message||e)) + '</code>', { parse_mode:'HTML' });
      }
    });
  }

  console.log('✅ Handler cargado: sniperReset.js');
}
