// src/commands/mensaje.js (ESM)
export default (bot) => {
  bot.onText(/^\/mensaje\b/, async (msg) => {
    const text =
`*Módulo conexiones activas  /mensaje*

🌐 Conectado a QuickNode 📡 Escaneando blockchain de Solana... 🧠 IA predictiva ACTIVADA 🎯 Precisión quirúrgica ACTIVADA 🚀 ¡Listo para cazar gemas!`;
    await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
  });
};
