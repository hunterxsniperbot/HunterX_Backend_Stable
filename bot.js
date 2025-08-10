// bot.js — HunterX (ESM) — FINAL

// ——— Errores globales ———
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});
process.on('uncaughtException', err => {
  console.error('❌ Uncaught Exception thrown:', err.stack || err);
  process.exit(1);
});

// ——— Imports base ———
import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import TelegramBot from 'node-telegram-bot-api';

// Services principales
import {
  supabaseClient,
  quickNodeClient,
  phantomClient,
  sheetsClient
} from './src/services/index.js';

// Comando AutoSniper (lo registramos explícito)
import registerAutoSniper from './src/commands/autoSniper.js';

// (Opcional) señales externas (no rompe si no hay keys/feed)
import {
  refreshSignalsFromWhales,
  refreshSignalsFromDiscord
} from './src/services/intel.js';

// ——— Init bot TG ———
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, {
  polling: {
    interval: 3000,
    params: { timeout: 20 },
    autoStart: true
  }
});

// Errores polling/webhook
bot.on('polling_error', (err) => {
  console.error('error: [polling_error]', JSON.stringify({
    code: err.code, message: err.message
  }));
});
bot.on('webhook_error', (err) => {
  console.error('error: [webhook_error]', err.message);
});

// ——— Estado global ———
bot.sniperConfig = {};          // por usuario (monto, scanInterval, etc.)
bot._intervals   = {};          // loops /autosniper por usuario
bot.demoMode     = {};          // flags DEMO
bot.realMode     = {};          // flags REAL
bot._stopProfitInterval = null; // si usás monitor global fuera de autoSniper
bot._positions   = {};          // posiciones abiertas por usuario
bot._guardEnabled = {};         // Guard ON/OFF por usuario (default ON vía lógica)
bot._guardMode    = {};         // 'hard' | 'soft'

// ——— Slash commands (orden exacto) ———
async function registerTelegramCommands() {
  await bot.setMyCommands([
    { command: 'mensaje',    description: 'Conexiones activas' },
    { command: 'autosniper', description: 'Activar sniper automático' },
    { command: 'real',       description: 'Modo (Trading real)' },
    { command: 'demo',       description: 'Modo (Demo simulación)' },
    { command: 'stop',       description: 'Detener sniper' },
    { command: 'wallet',     description: 'Ver posiciones abiertas' },
    { command: 'registro',   description: 'Ver posiciones cerradas' },
    { command: 'discord',    description: 'Tendencias en Discord' },
    { command: 'ajustes',    description: 'Configurar sniper' }
    // Nota: /debug queda oculto (no se agrega aquí)
  ]);
  console.log('[Slash] Comandos activos (orden): mensaje, autosniper, real, demo, stop, wallet, registro, discord, ajustes');
}

// ——— Carga handlers con whitelist ———
async function registerCommandHandlers() {
  const commandsDir = path.join(__dirname, 'src', 'commands');
  let files = [];
  try {
    files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));
  } catch (e) {
    console.error('[Commands] No se pudo leer src/commands:', e.message || e);
    return;
  }

  // Whitelist para no chocar con archivos viejos
  const WHITELIST = new Set([
    'mensaje.js',
    'ajustes.js',
    'demo.js',
    'wallet.js',
    'registro.js',
    'discord.js',
    'signals.js',
    'pick.js',
    'initSheets.js',
    'dbPing.js',
    // 'stop.js',      // NO cargar si /stop ya está dentro de autoSniper.js
    // 'real.js',      // si tenés handlers separados para /real y /demo, podés agregarlos
    // 'debug.js',     // lo dejamos oculto (ya está dentro de autoSniper.js)
  ]);

  for (const file of files) {
    // omitimos autoSniper.js aquí; lo registramos aparte al final
    if (file === 'autoSniper.js') continue;

    if (!WHITELIST.has(file)) {
      console.log(`[Commands] ignorado por whitelist: ${file}`);
      continue;
    }

    const modulePath = pathToFileURL(path.join(commandsDir, file)).href;
    try {
      const mod = await import(modulePath);
      if (typeof mod.default === 'function') {
        mod.default(bot, { supabaseClient, quickNodeClient, phantomClient, sheetsClient });
        console.log(`✅ Handler cargado: ${file}`);
      } else {
        console.log(`ℹ️ ${file} no exporta default function; omitido`);
      }
    } catch (err) {
      console.error(`❌ Error cargando ${file}:`, err);
    }
  }

  // Registrar autoSniper al final (incluye /autosniper, /stop, /debug)
  registerAutoSniper(bot, {
    quickNodeClient,
    phantomClient,
    sheetsClient,
    supabaseClient
  });
  console.log('✅ Handler cargado: autoSniper.js');
}

// ——— Arranque ———
(async () => {
  try {
    console.log('🔧 Iniciando bot…');
    await registerTelegramCommands();
    await registerCommandHandlers();

    // Cron de señales externas cada 60s (no rompe si no hay keys/feeds)
    setInterval(async () => {
      try {
        const n1 = await refreshSignalsFromWhales({ windowSec: 60, minUsd: 25000 });
        const n2 = await refreshSignalsFromDiscord();
        if (n1 || n2) console.log(`[signals] whales=${n1} discord=${n2}`);
      } catch (e) {
        // silencioso, no queremos tumbar el bot por señales externas
      }
    }, 60_000);

    console.log('🤖 HunterX Bot arrancado y escuchando comandos');
  } catch (err) {
    console.error('❌ Error arrancando el bot:', err.stack || err);
    process.exit(1);
  }
})();
