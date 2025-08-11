// src/commands/mensaje.js — Help/ayuda con comandos avanzados (ocultos)
export default function registerMensaje(bot /* , deps */) {
  const sendHelp = async (chatId) => {
    const text =
`<b>📖 HunterX — Ayuda avanzada</b>

<b>⚙️ Config & utilidades</b>
• <code>/init_sheets &lt;DemoTab&gt; &lt;RealTab&gt;</code>
  Configura los nombres de pestañas y crea/asegura encabezados en Google Sheets.
  Ej: <code>/init_sheets DEMO REAL</code>
• <code>/ajustes</code>
  Muestra/cambia parámetros del bot (monto por operación, slippage, etc.).
• <code>/dbping</code>
  Diagnóstico rápido: verifica conexión a Supabase, Sheets y claves.

<b>🧪 Operativa manual / test</b>
• <code>/pick &lt;par&gt; [monto] [slippage]</code>
  Simula/ejecuta compra del token:
  Ej: <code>/pick SOL/USDC 25 0.8</code> — o solo <code>/pick SOL</code>.
• <code>/registro</code>
  Muestra operaciones cerradas (DEMO/REAL) con filtros.
• <code>/wallet</code>
  Posiciones <u>abiertas</u> (DEMO/REAL), con refresco y botones de venta parcial.
• <code>/stop</code>
  Detiene el <i>autosniper</i> y también el refresco de <code>/wallet</code>.

<b>🤖 Sniper automático</b>
• <code>/autosniper</code>
  Activa/pausa el escaneo automático con <i>stop-profit</i> por tramos.
• <code>/demo</code>  /  <code>/real</code>
  Cambia el modo de ejecución (simulado o real).

<b>📊 Señales / Integraciones (si están habilitadas)</b>
• <code>/signals</code>  (o <code>/signal</code>)
  Muestra/recarga señales externas (whales/discord).
• <code>/discord</code>
  Configura/consulta hook de Discord para alertas.

<b>🩺 Salud (opcional)</b>
• <code>/health</code>
  Estado del bot y dependencias. (Si no está en whitelist, no aparece.)

<b>🔖 Atajos útiles</b>
• <code>/status</code> — Resumen (P&L diario/semanal/mensual).
• <code>/mensaje</code> / <code>/ayuda</code> / <code>/help</code> — Este panel.

<i>Tip:</i> si un comando no responde, revisá conexión de internet o claves en <code>.env</code>.`;
    
    const keyboard = {
      inline_keyboard: [
        [
          { text: '💼 Wallet', callback_data: 'cmd_wallet' },
          { text: '📘 Registro', callback_data: 'cmd_registro' },
          { text: '🤖 AutoSniper', callback_data: 'cmd_autosniper' },
        ],
        [
          { text: '🟣 DEMO', callback_data: 'cmd_demo' },
          { text: '🔵 REAL', callback_data: 'cmd_real' },
          { text: '⏹️ STOP', callback_data: 'cmd_stop' },
        ],
      ],
    };

    await bot.sendMessage(chatId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
      disable_web_page_preview: true,
    });
  };

  // /mensaje, /ayuda, /help
  bot.onText(/^\/(mensaje|ayuda|help)\b/i, async (msg) => {
    try { await sendHelp(msg.chat.id); } catch (e) { console.error('[mensaje]', e); }
  });

  // Botones del help (atajos)
  bot.on('callback_query', async (q) => {
    try {
      const chatId = q.message?.chat?.id;
      if (!chatId) return;
      switch (q.data) {
        case 'cmd_wallet':     return bot.emit('text', { ...q.message, text: '/wallet' });
        case 'cmd_registro':   return bot.emit('text', { ...q.message, text: '/registro' });
        case 'cmd_autosniper': return bot.emit('text', { ...q.message, text: '/autosniper' });
        case 'cmd_demo':       return bot.emit('text', { ...q.message, text: '/demo' });
        case 'cmd_real':       return bot.emit('text', { ...q.message, text: '/real' });
        case 'cmd_stop':       return bot.emit('text', { ...q.message, text: '/stop' });
        default: return;
      }
    } catch (e) {
      console.error('[mensaje callbacks]', e?.message || e);
    } finally {
      // limpiar el “relojito” del botón
      try { await bot.answerCallbackQuery(q.id); } catch {}
    }
  });
}
