console.log('🔧 Cargando bot.js…');

const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');

// Inicializar bot
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Cargar automáticamente todos los comandos
fs.readdirSync(path.join(__dirname, 'src/commands'))
  .filter(file => file.endsWith('.js'))
  .forEach(file => {
    const command = require(path.join(__dirname, 'src/commands', file));
    if (typeof command === 'function') {
      command(bot);
    }
  });

// Función de lanzamiento con reintentos
async function startBot(attempts = 0) {
  try {
    await bot.launch({ polling: true });
    console.log('✅ Bot iniciado y escuchando comandos');
  } catch (err) {
    console.error(\`❌ Error al lanzar el bot (intento \${attempts + 1}):\`, err.message);
    if (attempts < 5) {
      console.log('🔁 Reintentando en 5 segundos…');
      setTimeout(() => startBot(attempts + 1), 5000);
    } else {
      console.error('💥 No se pudo iniciar el bot tras varios intentos');
    }
  }
}

// Iniciar el bot
startBot();

// Manejo de cierre limpio
process.once('SIGINT', () => {
  bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  process.exit(0);
});
