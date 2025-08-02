// modules/start.js

module.exports = function registerStartCommand(bot, services) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    // “Ping” a cada servicio
    try { await services.quickNode.ping(); } catch (e) { console.error('QuickNode ping failed:', e); }
    try { await services.phantom.healthCheck(); } catch (e) { console.error('Phantom health check failed:', e); }
    try { await services.supabase.ping(); } catch (e) { console.error('Supabase ping failed:', e); }
    try { await services.sheets.ping(); } catch (e) { console.error('Sheets ping failed:', e); }

    const welcomeMessage = [
      '📲 *Iniciando HunterX...*',
      '🌐 Conectado a QuickNode',
      '📡 Escaneando blockchain de Solana...',
      '🧠 Activando IA predictiva',
      '🎯 Precisión quirúrgica ACTIVADA',
      '🚀 _¡Listo para cazar gemas!_'
    ].join('\n');

    await bot.sendMessage(chatId, welcomeMessage, { parse_mode: 'Markdown' });
  });
};
