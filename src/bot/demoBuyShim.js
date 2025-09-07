export function registerDemoBuyShim(bot){
  // Captura: /demo_buy <monto> <TOKEN>
  bot.onText(/^\s*\/demo_buy\s+(\d+(?:\.\d+)?)\s+([A-Za-z0-9_]+)\s*$/i, async (msg, m) => {
    const chatId = msg.chat.id;
    const amount = m[1];
    const sym = (m[2]||'').toUpperCase();
    // No usamos el símbolo en DEMO; reenviamos al handler original
    try {
      await bot.sendMessage(chatId, `📝 Interpreté "/demo_buy ${amount} ${sym}" como "/demo_buy ${amount}" (en DEMO el símbolo es opcional).`);
      await bot.sendMessage(chatId, `/demo_buy ${amount}`);
    } catch (e) {
      await bot.sendMessage(chatId, `❌ Error shim /demo_buy: ${String(e?.message||e)}`);
    }
  });
}
