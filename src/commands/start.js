// src/commands/start.js

/**
 * Módulo 1: /start
 * Handler para mostrar mensaje de bienvenida e inicializar servicios en "frío".
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 *   - services.quickNodeClient  Cliente QuickNode RPC
 *   - services.phantomClient    Cliente Phantom Wallet
 *   - services.supabaseClient   Cliente Supabase
 *   - services.sheetsClient     Cliente Google Sheets
 */
export default function registerStart(bot, services) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    // Ping a QuickNode
    try {
      await services.quickNodeClient.ping();
      console.log('QuickNode OK');
    } catch (e) {
      console.error('QuickNode ping fallido:', e);
    }

    // Health-check Phantom
    try {
      await services.phantomClient.healthCheck();
      console.log('Phantom OK');
    } catch (e) {
      console.error('Phantom health check fallido:', e);
    }

    // Ping Supabase (simple select de prueba)
    try {
      await services.supabaseClient.from('test').select('*').limit(1);
      console.log('Supabase OK');
    } catch (e) {
      console.error('Supabase ping fallido:', e);
    }

    // Ping Google Sheets
    try {
      await services.sheetsClient.ping();
      console.log('Google Sheets OK');
    } catch (e) {
      console.error('Google Sheets ping fallido:', e);
    }

    // Mensaje de bienvenida
    const welcomeMessage = [
      '📲 *Iniciando HunterX...*',
      '🌐 Conectado a QuickNode',
      '📡 Escaneando blockchain de Solana...',
      '🧠 Activando IA predictiva',
      '🎯 Precisión quirúrgica ACTIVADA',
      '🚀 _¡Listo para cazar gemas!_'
    ].join('\n');

    await bot.sendMessage(chatId, welcomeMessage, {
      parse_mode: 'Markdown'
    });
  });
}
