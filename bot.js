// bot.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import TelegramBot from 'node-telegram-bot-api';
import { supabaseClient, quickNodeClient, phantomClient, sheetsClient } from './src/services/index.js';

// Import estático TU HANDLER de AutoSniper
import registerAutoSniper from './src/commands/autoSniper.js';

// —–––––––––––––––––––––––––––––––––
// Inicialización del bot
// —–––––––––––––––––––––––––––––––––
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {
  polling: {
    interval: 3000,
    timeout: 60,
    retries: Infinity,
    autoStart: true
  }
});

// Estado global
bot.sniperConfig = {};
bot._intervals  = {};
bot.demoMode    = {};

// —–––––––––––––––––––––––––––––––––
// Registra comandos slash
// —–––––––––––––––––––––––––––––––––
async function registerTelegramCommands() {
  await bot.setMyCommands([
    { command: 'start',       description: 'Iniciar HunterX' },
    { command: 'settings',    description: 'Configurar sniper' },
    { command: 'autosniper',  description: 'Activar sniper automático' },
    { command: 'stop',        description: 'Detener sniper' },
    { command: 'cartera',     description: 'Ver mi cartera' },
    { command: 'history',     description: 'Ver historial' },
    { command: 'help',        description: 'Ayuda rápida' }
  ]);
}

// —–––––––––––––––––––––––––––––––––
// Carga handlers de src/commands
// —–––––––––––––––––––––––––––––––––
async function registerCommandHandlers() {
  const commandsDir = path.join(__dirname, 'src', 'commands');
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

  for (const file of files) {
    // omitimos autoSniper.js aquí si queremos registrarlo aparte
    if (file === 'autoSniper.js') continue;

    const modulePath = pathToFileURL(path.join(commandsDir, file)).href;
    const mod = await import(modulePath);
    if (typeof mod.default === 'function') {
      mod.default(bot, { supabaseClient, quickNodeClient, phantomClient, sheetsClient });
      console.log(`✅ Handler cargado: ${file}`);
    }
  }

  // Ahora registramos el sniper automático
  registerAutoSniper(bot, {
    quickNodeClient,
    phantomClient,
    sheetsClient,
    supabaseClient
  });
  console.log('✅ Handler cargado: autoSniper.js');
}


// —–––––––––––––––––––––––––––––––––
// Arranque del bot
// —–––––––––––––––––––––––––––––––––
(async () => {
  try {
    console.log('🔧 Iniciando bot…');
    await registerTelegramCommands();
    await registerCommandHandlers();
    console.log('🤖 HunterX Bot arrancado y escuchando comandos');
  } catch (err) {
    console.error('❌ Error arrancando el bot:', err);
    process.exit(1);
  }
})();
