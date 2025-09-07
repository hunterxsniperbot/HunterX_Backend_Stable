export async function publishSlashCommands(bot) {
  if (String(process.env.PUBLISH_COMMANDS||'1') !== '1') return;

  const commands = [
    { command: 'salud',    description: 'Conexiones activas' },
    { command: 'autosniper', description: 'Sniper (on/off/status al escribirlos)' },
    { command: 'real',     description: 'Modo trading REAL' },
    { command: 'demo',     description: 'Modo DEMO (simulación)' },
    { command: 'stop',     description: 'Detener sniper' },
    { command: 'wallet',   description: 'Ver posiciones abiertas' },
    { command: 'registro', description: 'Ver posiciones cerradas' },
    { command: 'ajustes',  description: 'Configurar sniper' },
    { command: 'mensaje',  description: 'Ayuda' },
  ];

  try {
    await // // bot.setMyCommands(commands);
    console.log('🟦 [Slash] comandos seteados (HX menú curado)');
  } catch (e) {
    console.log('⚠️  setMyCommands falló:', e?.message || e);
  }
}
