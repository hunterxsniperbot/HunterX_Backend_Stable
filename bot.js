// bot.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import TelegramBot from 'node-telegram-bot-api';

// Importa los servicios reales
import {
  supabaseClient,
  quickNodeClient,
  phantomClient,
  sheetsClient
} from './src/services/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Instancia del bot con polling
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

// Estado global por usuario
bot.sniperConfig = {};
bot.demoMode    = {};

// 1) Registrar comandos slash en Telegram
async function registerTelegramCommands() {
  const commands = [
    { command: 'start',         description: 'Iniciar HunterX' },
    { command: 'tendencias',    description: 'Mostrar tendencias en Discord' },
    { command: 'vertokens',     description: 'Ver tokens nuevos' },
    { command: 'activarsniper', description: 'Activar sniper automático' },
    { command: 'detener',       description: 'Detener sniper' },
    { command: 'configurar',    description: 'Configurar parámetros' },
    { command: 'cartera',       description: 'Ver mi cartera' },
    { command: 'historial',     description: 'Ver historial' },
    { command: 'demo',          description: 'Activar modo demo' },
    { command: 'help',          description: 'Ayuda rápida' },
  ];
  await bot.setMyCommands(commands);
  console.log('✅ Comandos slash registrados en Telegram');
}

// 2) Registrar dinámicamente todos los handlers de src/commands
async function registerCommandHandlers() {
  const commandsDir = path.join(__dirname, 'src', 'commands');
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const modulePath = pathToFileURL(path.join(commandsDir, file)).href;
    try {
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
    } catch (err) {
      console.error(`❌ Error cargando handler ${file}:`, err.message);
    }
  }
}

// 3) Función principal de arranque
export default async function startBot() {
  console.log('🔧 Iniciando bot…');
  await registerTelegramCommands();
  await registerCommandHandlers();
  console.log('🤖 HunterX Bot arrancado y escuchando comandos');
}
