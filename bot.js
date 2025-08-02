// bot.js
import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import QuickNodeService from './src/services/quicknode.js';
import PhantomService   from './src/services/phantom.js';
import SheetsService    from './src/services/sheets.js';

async function startBot() {
  // 1) Instanciar servicios
  const supabaseClient = createSupabaseClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );
  const quickNodeClient = QuickNodeService({ rpcUrl: process.env.QUICKNODE_RPC_URL });
  const phantomClient   = PhantomService({
    privateKeyBase58: process.env.PHANTOM_PRIVATE_KEY,
    rpcUrl:           process.env.QUICKNODE_RPC_URL
  });
  const sheetsClient   = SheetsService({
    credentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS,
    sheetId:         process.env.GOOGLE_SHEETS_ID
  });
  const services = { supabaseClient, quickNodeClient, phantomClient, sheetsClient };

  // 2) Instanciar el bot
  const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
  console.log('✅ Polling iniciado en Telegram');

  // 3) Registrar Slash Commands
  await bot.setMyCommands([
    { command: 'start',         description: 'Iniciar HunterX' },
    { command: 'tendencias',    description: 'Mostrar tendencias en Discord' },
    { command: 'vertokens',     description: 'Ver tokens nuevos' },
    { command: 'activarsniper', description: 'Activar sniper automático' },
    { command: 'detener',       description: 'Detener sniper' },
    { command: 'configurar',    description: 'Configurar parámetros' },
    { command: 'cartera',       description: 'Ver mi cartera' },
    { command: 'historial',     description: 'Ver historial' },
    { command: 'demo',          description: 'Alternar modo demo' },
    { command: 'help',          description: 'Ayuda rápida' },
  ]);
  console.log('✅ Comandos slash registrados en Telegram');

  // 4) Cargar dinámicamente todos los comandos
  const __filename = fileURLToPath(import.meta.url);
  const __dirname  = path.dirname(__filename);
  const commandsDir = path.join(__dirname, 'src', 'commands');

  for (const file of fs.readdirSync(commandsDir)) {
    if (!file.endsWith('.js')) continue;
    const modulePath = pathToFileURL(path.join(commandsDir, file)).href;
    const mod        = await import(modulePath);
    if (typeof mod.default === 'function') {
      mod.default(bot, services);
    }
  }

  console.log('🤖 HunterX Bot arrancado y escuchando comandos');
}

export default startBot;
