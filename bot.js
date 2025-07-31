const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');

// Inicializar bot
const bot = new Telegraf(process.env.TELEGRAM_TOKEN);

// Cargar automáticamente todos los comandos
fs.readdirSync(path.join(__dirname, 'src/commands'))
  .filter(file => file.endsWith('.js'))
  .forEach(file => {
    const command = require(`./src/commands/${file}`);
    if (typeof command === 'function') {
      command(bot);
    }
  });

// Lanzar bot
bot.launch({ polling: true })
  .then(() => console.log('✅ Bot iniciado y escuchando comandos'))
  .catch(console.error);

// Cierre limpio
process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
