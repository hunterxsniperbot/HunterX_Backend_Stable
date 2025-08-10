// src/commands/initSheets.js — /init_sheets (A..Z headers DEMO/REAL)
// Si sheetsClient no soporta sheetName, escribe headers en la hoja por defecto.

const HEADERS_AZ = [
  'timestamp_iso','datetime_local','user_id','mode','type','token','mint',
  'amount_usd','qty_tokens','entry_price_usd','exit_price_usd','slippage_pct',
  'tx','src','age_min','liq_sol','fdv_usd','holders','vol_usd_min',
  'guard_mode','guard_flags','whale_signal','discord_signal','intel_score',
  'pnl_usd','pnl_pct'
];

function getAppendCompat(sheetsClient) {
  if (!sheetsClient) return null;
  if (typeof sheetsClient.appendRow === 'function') {
    return async (row, opts={}) => {
      try { await sheetsClient.appendRow(row, opts); }
      catch { await sheetsClient.appendRow(row); }
    };
  }
  if (typeof sheetsClient === 'function') {
    return async (row, opts={}) => {
      try { await sheetsClient(row, opts); }
      catch { await sheetsClient(row); }
    };
  }
  return null;
}

export default function registerInitSheets(bot, { sheetsClient }) {
  bot.onText(/^\/init_sheets$/i, async (msg) => {
    const chatId = msg.chat.id;
    const append = getAppendCompat(sheetsClient);
    if (!append) return bot.sendMessage(chatId, '⚠️ Sheets no está configurado.');

    try {
      await append(HEADERS_AZ, { sheetName: 'DEMO', ensureHeader: true });
      await append(HEADERS_AZ, { sheetName: 'REAL', ensureHeader: true });
      await bot.sendMessage(chatId, '🧾 Headers A..Z asegurados en pestañas DEMO y REAL.');
    } catch (e) {
      // Fallback: hoja por defecto
      try {
        await append(HEADERS_AZ);
        await bot.sendMessage(chatId, '🧾 Headers A..Z escritos en la hoja por defecto (tu cliente no soporta pestañas).');
      } catch (err) {
        await bot.sendMessage(chatId, `❌ No se pudieron escribir headers: ${err?.message || err}`);
      }
    }
  });
}
