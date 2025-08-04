// src/commands/start.js
export default function registerStart(bot, { quickNodeClient, supabaseClient, phantomClient, sheetsClient }) {
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;

    // 🔌 Verificamos servicios (opcionales, pero recomendados)
    try {
      await supabaseClient.from('test').select('*').limit(1);
      console.log('✅ Supabase OK');
    } catch (e) {
      console.error('❌ Error Supabase:', e.message);
    }

    try {
      await quickNodeClient.ping();
      console.log('✅ QuickNode OK');
    } catch (e) {
      console.error('❌ QuickNode ping fallido:', e.message);
    }

    try {
      await phantomClient.healthCheck();
      console.log('✅ Phantom OK');
    } catch (e) {
      console.error('❌ Phantom health check fallido:', e.message);
    }

    try {
      await sheetsClient.ping();
      console.log('✅ Google Sheets OK');
    } catch (e) {
      console.error('❌ Google Sheets ping fallido:', e.message);
    }

    // 🙌 Mensaje de bienvenida SIN teclado táctil
    const lines = [
      '👻 ¡Bienvenido a HunterX!',
      '🌐 Conectado a QuickNode',
      '📡 Escaneando blockchain de Solana...',
      '🧠 IA predictiva ACTIVADA',
      '🎯 Precisión quirúrgica ACTIVADA',
      '🚀 ¡Listo para cazar gemas!'
    ];
    const welcome = lines.join('\n');

    await bot.sendMessage(chatId, welcome, {
      parse_mode: 'Markdown'
      // No reply_markup aquí → no aparece teclado táctil
    });
  });
}
