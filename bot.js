// bot.js
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import TelegramBot from 'node-telegram-bot-api';
import { createClient } from '@supabase/supabase-js';

// --- Inicialización de rutas para ES Modules ---
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// --- Servicios principales ---
const supabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// --- Instancia del bot ---
const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
bot.sniperConfig = {};
bot.demoMode    = {};

// --- Registro de Slash Commands ---
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

// --- Registro dinámico de handlers desde src/commands ---
async function registerCommandHandlers() {
  const commandsDir = path.join(__dirname, 'src', 'commands');  // <--- aquí debe apuntar
  const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const modulePath = pathToFileURL(path.join(commandsDir, file)).href;
    try {
      const mod = await import(modulePath);
      if (typeof mod.default === 'function') {
        mod.default(bot, {
          supabaseClient,
          quickNodeClient: null,  // si usas servicios, pásalos aquí
          phantomClient:   null,
          sheetsClient:    null
        });
        console.log(`✅ Handler cargado: ${file}`);
      }
    } catch (err) {
      console.error(`❌ Error cargando handler ${file}:`, err.message);
    }
  }
}

// --- Función principal de arranque ---
export default async function startBot() {
  console.log('🔧 Iniciando bot…');
  await registerTelegramCommands();
  await registerCommandHandlers();
  console.log('🤖 HunterX Bot arrancado y escuchando comandos');
}
