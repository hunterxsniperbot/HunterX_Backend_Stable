// ─────────────────────────────────────────────────────────────────────────────
// HUNTER X — Mode Toggle (REAL/DEMO) — HX-A05 — v2025-08-19 (ESM)
// Archivo: src/commands/mode.js
//
// Qué hace:
//   • Mantiene por usuario el modo de trading: DEMO (simulado) o REAL (Phantom).
//   • Persistencia opcional vía services/state.js (getRealModeMap/setRealMode).
//   • Comandos:
//       /mode    → muestra el modo actual + botones para alternar
//       /real    → cambia a REAL
//       /demo    → cambia a DEMO
//   • Si el sniper está ON, aclara que el cambio aplica a futuras entradas.
//   • Si falta configuración para REAL (ej. Phantom), avisa en el mensaje.
//
// Contratos esperados (best-effort):
//   - state.getRealModeMap?.() => Promise<Record<uid, boolean>>
//   - state.setRealMode?.(uid, isReal:boolean) => Promise<void>
//
// Notas:
//   - No rompe si services/state.js no implementa los métodos (se usa optional chaining).
//   - Usa HTML como parse_mode (coherente con el resto del bot).
//   - Evita doble registro de listeners con removeTextListener (si está disponible).
// ─────────────────────────────────────────────────────────────────────────────

import * as state from '../services/state.js';

// Helpers internos
function isReal(bot, uid) {
  return !!(bot.realMode && bot.realMode[uid]);
}
function setModeLocal(bot, uid, toReal) {
  bot.realMode = bot.realMode || {};
  bot.realMode[uid] = !!toReal;
}

/** Construye el texto de estado del modo con advertencias útiles. */
function buildModeText({ uid, onReal, sniperOn, phantomOk }) {
  const lines = [];

  lines.push('<b>⚙️ Modo de trading</b>');
  lines.push(`• Usuario: <code>${uid}</code>`);
  lines.push(`• Modo actual: ${onReal ? '<b>REAL</b> 💳' : '<b>DEMO</b> 🧪'}`);

  if (sniperOn) {
    lines.push('• Sniper: <b>ON</b> — El cambio aplica a <i>nuevas</i> entradas.');
  } else {
    lines.push('• Sniper: OFF — Podés alternar libremente.');
  }

  if (onReal && !phantomOk) {
    lines.push('');
    lines.push('⚠️ <b>Advertencia:</b> estás en <b>REAL</b> pero falta configuración de Phantom (PHANTOM_PUBLIC_KEY / PHANTOM_ADDRESS / client).');
  }

  lines.push('');
  lines.push('Elegí abajo con los botones o usa <code>/real</code> / <code>/demo</code>.');

  return lines.join('\n');
}

/** Teclado inline con opciones DEMO/REAL y estado. */
function buildModeKeyboard(onReal) {
  return {
    inline_keyboard: [
      [
        { text: onReal ? '✅ REAL' : 'REAL', callback_data: 'mode:set:real' },
        { text: !onReal ? '✅ DEMO' : 'DEMO', callback_data: 'mode:set:demo' },
      ],
    ],
  };
}

export default function registerMode(bot) {
  bot.realMode = bot.realMode || {};

  // Cargar mapa persistido (si existe)
  try {
    state.getRealModeMap?.()
      .then((map) => {
        if (map && typeof map === 'object') {
          bot.realMode = { ...bot.realMode, ...map };
          console.log('🗂️ [mode] RealMode map cargado (persistencia)');
        }
      })
      .catch(() => {});
  } catch {}

  // Limpieza de listeners anteriores (si el runtime lo soporta)
  bot.removeTextListener?.(/^\s*\/mode\s*$/i);
  bot.removeTextListener?.(/^\s*\/real\s*$/i);
  bot.removeTextListener?.(/^\s*\/demo\s*$/i);

  // /mode → muestra estado y botones para alternar
  bot.onText(/^\s*\/mode\s*$/i, async (msg) => {
    const uid = String(msg.from.id);
    const chatId = msg.chat.id;
    const onReal = isReal(bot, uid);
    const sniperOn = !!(bot._sniperOn && bot._sniperOn[uid]);
    const phantomOk = !!(process.env.PHANTOM_PUBLIC_KEY || process.env.PHANTOM_ADDRESS || bot._phantomClient);

    const text = buildModeText({ uid, onReal, sniperOn, phantomOk });
    const reply_markup = buildModeKeyboard(onReal);

    try {
      await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        reply_markup,
        disable_web_page_preview: true,
      });
    } catch (e) {
      console.error('[mode]/mode sendMessage:', e?.message || e);
    }
  });

  // /real → activa modo REAL
  bot.onText(/^\s*\/real\s*$/i, async (msg) => {
    const uid = String(msg.from.id);
    const chatId = msg.chat.id;

    setModeLocal(bot, uid, true);
    state.setRealMode?.(uid, true).catch(() => {});

    const sniperOn = !!(bot._sniperOn && bot._sniperOn[uid]);
    const phantomOk = !!(process.env.PHANTOM_PUBLIC_KEY || process.env.PHANTOM_ADDRESS || bot._phantomClient);
    const note = sniperOn ? ' <i>(Sniper ON: se aplica a nuevas entradas)</i>' : '';

    const warn = !phantomOk
      ? '\n\n⚠️ <b>Falta configurar Phantom para operar REAL.</b>'
      : '';

    return bot.sendMessage(
      chatId,
      '⚡ <b>Modo REAL activado</b>' + note + warn,
      { parse_mode: 'HTML' },
    );
  });

  // /demo → activa modo DEMO
  bot.onText(/^\s*\/demo\s*$/i, async (msg) => {
    const uid = String(msg.from.id);
    const chatId = msg.chat.id;

    setModeLocal(bot, uid, false);
    state.setRealMode?.(uid, false).catch(() => {});

    const sniperOn = !!(bot._sniperOn && bot._sniperOn[uid]);
    const note = sniperOn ? ' <i>(Sniper ON: se aplica a nuevas entradas)</i>' : '';

    return bot.sendMessage(
      chatId,
      '🧪 <b>Modo DEMO activado</b>' + note,
      { parse_mode: 'HTML' },
    );
  });

  // Callbacks de /mode (botones)
  bot.on('callback_query', async (q) => {
    const data = String(q.data || '');
    if (!data.startsWith('mode:set:')) return;

    const chatId = q.message?.chat?.id;
    const uid = String(q.from?.id || '');
    if (!chatId || !uid) return;

    const toReal = data.endsWith(':real');

    setModeLocal(bot, uid, toReal);
    state.setRealMode?.(uid, toReal).catch(() => {});

    const onReal = isReal(bot, uid);
    const sniperOn = !!(bot._sniperOn && bot._sniperOn[uid]);
    const phantomOk = !!(process.env.PHANTOM_PUBLIC_KEY || process.env.PHANTOM_ADDRESS || bot._phantomClient);

    const text = buildModeText({ uid, onReal, sniperOn, phantomOk });
    const reply_markup = buildModeKeyboard(onReal);

    try {
      await bot.editMessageText(text, {
        chat_id: chatId,
        message_id: q.message.message_id,
        parse_mode: 'HTML',
        reply_markup,
        disable_web_page_preview: true,
      });
      await bot.answerCallbackQuery(q.id, {
        text: onReal ? 'Modo REAL' : 'Modo DEMO',
        show_alert: false,
      });
    } catch (e) {
      // Si el mensaje “no cambió”, algunas veces TG da error. Ignoramos el caso benigno.
      const m = String(e?.message || e || '');
      if (!/message is not modified/i.test(m)) {
        console.error('[mode] editMessageText:', m);
      }
      bot.answerCallbackQuery(q.id).catch(() => {});
    }
  });

  console.log('✅ Handler cargado: mode.js (HX-A05)');
}
