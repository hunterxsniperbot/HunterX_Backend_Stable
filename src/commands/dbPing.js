// src/commands/dbPing.js — /db_ping: inserta fila de prueba en public.trades
export default function registerDbPing(bot, { supabaseClient }) {
  bot.onText(/^\/db_ping$/i, async (msg) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);

    try {
      const now = new Date();
      const row = {
        fecha_hora: now.toISOString(),
        mode: 'DEMO',
        token: 'PING',
        mint: 'PING_MINT',
        entrada_usd: 0,
        salida_usd: null,
        inversion_usd: 0,
        pnl_usd: null,
        pnl_pct: null,
        slippage_pct: null,
        volumen_24h_usd: null,
        liquidez_usd: null,
        holders: null,
        fdv_usd: null,
        marketcap_usd: null,
        red: 'Solana',
        fuente: 'BOT_TEST',
        url: null,
        extra: { by: 'db_ping', user_id: uid }
      };

      // usa el cliente real si hay credenciales; si no, el stub
      const { data, error } = await supabaseClient.upsertTrade(row);
      if (error) throw error;

      await bot.sendMessage(chatId, '✅ DB OK: fila de prueba insertada en `public.trades`.');
    } catch (e) {
      await bot.sendMessage(chatId, `❌ DB error: ${e?.message || e}`);
    }
  });
}
