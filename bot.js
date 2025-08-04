// bot.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import TelegramBot from 'node-telegram-bot-api';

import {
  supabaseClient,
  quickNodeClient,
  phantomClient,
  sheetsClient
} from './src/services/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Inicializa el bot con polling robusto
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {
  polling: {
    interval: 3000,
    timeout: 60,
    retries: Infinity,
    autoStart: true
  }
});

// Estado por usuario
bot.sniperConfig = {};
bot._lastPnl    = {};
bot.demoMode    = {};

// Registra comandos slash
async function registerTelegramCommands() {
  await bot.setMyCommands([
    { command: 'start',       description: 'Iniciar HunterX' },
    { command: 'settings',    description: 'Configurar sniper' },
    { command: 'autosniper',  description: 'Activar sniper automático' },
    { command: 'detener',     description: 'Detener sniper automático' },
    { command: 'cartera',     description: 'Ver mi cartera' },
    { command: 'history',     description: 'Ver historial de trades' },
    { command: 'demo',        description: 'Demo ON/OFF' },
    { command: 'help',        description: 'Ayuda rápida' }
    // añade más si los usas
  ]);
}

// Carga handlers de src/commands
async function registerCommandHandlers() {
  const commandsDir = path.join(__dirname, 'src', 'commands');
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const modulePath = pathToFileURL(path.join(commandsDir, file)).href;
    const mod = await import(modulePath);
    if (typeof mod.default === 'function') {
      mod.default(bot, {
        supabaseClient,
        quickNodeClient,
        phantomClient,
        sheetsClient
      });
      console.log(`✅ Handler cargado: ${file}`);
    }
  }

  // Finalmente, registra tus callbacks de inline keyboards
  const cbPath = pathToFileURL(path.join(__dirname, 'src', 'commands', 'callbacks.js')).href;
  const { default: registerCallbacks } = await import(cbPath);
  registerCallbacks(bot, {
    supabaseClient,
    quickNodeClient,
    phantomClient,
    sheetsClient
  });
  console.log('✅ Handler cargado: callbacks.js');
}

// Función principal de arranque
export default async function startBot() {
  console.log('🔧 Iniciando bot…');
  await registerTelegramCommands();
  await registerCommandHandlers();
  console.log('🤖 HunterX Bot arrancado y escuchando comandos');
}
