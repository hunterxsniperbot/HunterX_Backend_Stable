// src/commands/mensaje.js
// Muestra SOLO la ayuda avanzada (comandos "ocultos") en HTML.

export default function registerMensaje(bot) {
  // limpiamos posibles listeners previos
  bot.removeTextListener?.(/^\/mensaje(?:@[\w_]+)?$/i);

  bot.onText(/^\/mensaje(?:@[\w_]+)?$/i, async (msg) => {
    const chatId = msg.chat.id;

    const lines = [
      '<b>📖 HunterX — Ayuda avanzada</b>',
      '',
      '<b>🛰️ Health (live)</b>',
      '• <code>/health</code> — empieza con base 10 s, se va espaciando si todo está quieto.',
      '• <code>/health 5</code> — base 5 s (más ágil).',
      '• <code>/health once</code> — una foto sin loop.',
      '• <code>/health stop</code> — o botón ⏹️ Parar para detener el loop.',
      '',
      '<b>🤖 Sniper automático</b>',
      '• <code>/autosniper on</code> — activa.',
      '• <code>/autosniper off</code> — detiene.',
      '• <code>/autosniper status</code> — estado actual.',
      '• Persistencia: ON/OFF queda guardado; reanuda al reiniciar.',
      '• Anti-reentrancia: evita escaneos solapados.',


      '',
      '<b>🔖 Atajos útiles</b>',
      '• <code>/status</code> — Resumen (P&amp;L diario/semanal/mensual).',
      '• <code>/sniperreset</code> — Reset por usuario (apaga, limpia y persiste OFF).',
      '• <code>/autosniper status</code> — Ver estado actual.',
      '',
      '<b>🧪 Operativa manual / test</b>',
      '• <code>/pick PAR [monto] [slippage]</code> — Simula/ejecuta compra.',
      '  Ej: <code>/pick SOL/USDC 25 0.8</code> — o solo <code>/pick SOL</code>.',
      '• <code>/init_sheets DEMO_TAB REAL_TAB</code> — Configura pestañas y asegura encabezados en Google Sheets.',
      '  Ej: <code>/init_sheets DEMO REAL</code>.',
      '',
      '<i>(Estos comandos no aparecen en el menú “/”, pero están disponibles.)</i>'
    ];

    const text = lines.join('\n');
    return bot.sendMessage(chatId, text, { parse_mode:'HTML', disable_web_page_preview:true });
  });

  console.log('✅ Handler cargado: mensaje.js (ayuda avanzada)');
}
