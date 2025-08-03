// webhook.js
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

// Importa tus servicios
import { supabaseClient, quickNodeClient, phantomClient, sheetsClient } from './src/services/index.js';

const token  = process.env.TELEGRAM_TOKEN;
const secret = process.env.WEBHOOK_SECRET;          // define esto en Render
const url    = process.env.WEBHOOK_URL;             // ej: https://<tu-app>.onrender.com

// 1) Inicializamos el bot SIN polling
const bot = new TelegramBot(token);
bot.sniperConfig = {};
bot.demoMode    = {};

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// 2) Cargamos tus comandos slash y handlers
async function setupBot() {
  // Comandos slash
  await bot.setMyCommands([
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
  ]);
  console.log('✅ Comandos slash registrados');

  // Handlers dinámicos
  const commandsDir = path.join(__dirname, 'src', 'commands');
  for (const file of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
    const modulePath = pathToFileURL(path.join(commandsDir, file)).href;
    const mod = await import(modulePath);
    if (typeof mod.default === 'function') {
      mod.default(bot, { supabaseClient, quickNodeClient, phantomClient, sheetsClient });
      console.log(`✅ Handler cargado: ${file}`);
    }
  }
}

await setupBot();

// 3) Levantamos Express
const app = express();
app.use(bodyParser.json());

// Valida header secreto que Telegram envía
app.post(`/bot${token}`, (req, res) => {
  if (req.headers['x-telegram-bot-api-secret-token'] !== secret) {
    console.warn('🚫 Petición no autorizada:', req.ip);
    return res.sendStatus(401);
  }
  bot.processUpdate(req.body);  // entrega el update a tu bot
  res.sendStatus(200);
});

// Ruta de salud
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Webhook server listening on port ${PORT}`);
  // Registra el webhook en Telegram
  bot.setWebHook(`${url}/bot${token}`, { secret_token: secret })
     .then(() => console.log('✅ Webhook registrado en Telegram'))
     .catch(err => console.error('❌ Error al registrar webhook:', err.message));
});
