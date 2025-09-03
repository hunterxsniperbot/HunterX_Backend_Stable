console.log('✅ registerComandos OK');

export function registerComandos(bot){
  const texto =
`<b>📋 Comandos disponibles</b>

<b>Sniper</b>
• /autosniper — (=on)
• /autosniper on | off | status
• /candidatos — top 3 con botones DEMO

<b>DEMO trading</b>
• /demo_buy <usd> [SIMBOLO]
• /demo_sell <precioUsd> [SIMBOLO]
• /demo_state
• /demo_reset <usd_inicial>

<b>Wallet & registro</b>
• /wallet
• /registro_export

<b>Salud & estado</b>
• /salud   (o /health)
• /status

<b>Ayuda</b>
• /mensaje — ayuda avanzada`;

  const opts = { parse_mode: 'HTML', disable_web_page_preview: true };

  // Acepta /comandos, /comandos@TuBot, con o sin espacios extra
  bot.onText(/^\s*\/comandos(?:@[\w_]+)?(?:\s+.*)?\s*$/i, (msg)=> bot.sendMessage(msg.chat.id, texto, opts));
  bot.onText(/^\s*\/help(?:@[\w_]+)?(?:\s+.*)?\s*$/i,     (msg)=> bot.sendMessage(msg.chat.id, texto, opts));
}
