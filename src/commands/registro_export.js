import { getState } from '../services/demoBank.js';
import { getSheets } from '../services/sheetsClient.js';

let exportedCount = 0; // contador en memoria (simple). Si reinicias, exportará otra vez lo no persistido.

function fmt(n, d=6){ return Number(n).toFixed(d); }

export function registerRegistroExport(bot){
  bot.onText(/^\/registro_export$/i, async (msg) => {
    const chatId = msg.chat.id;
    try{
      const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
      if (!SHEET_ID) throw new Error('Falta GOOGLE_SHEETS_ID en .env');
      const { closed } = getState();
      const pending = closed.slice(exportedCount);
      if (!pending.length){
        await bot.sendMessage(chatId, '📒 No hay cierres nuevos para exportar.');
        return;
      }

      const rows = pending.map(c => ([
        c.ts,
        c.token,
        fmt(c.qty, 6),
        fmt(c.priceIn, 4),
        fmt(c.priceOut, 4),
        fmt(c.amountUsd, 2),
        fmt(c.pnlUsd, 2),
        (process.env.WALLET_MODE || 'DEMO'),
      ]));

      const sheets = getSheets();
      // Crea hoja "Registros" si no existe (append la crea en la primera vez de muchos casos).
      await sheets.spreadsheets.values.append({
        spreadsheetId: SHEET_ID,
        range: 'Registros!A1',
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: rows },
      });

      exportedCount += pending.length;
      await bot.sendMessage(chatId, `✅ Exportadas ${pending.length} fila(s) a *Registros*`, { parse_mode:'Markdown' });
    }catch(e){
      await bot.sendMessage(chatId, '❌ Export error: '+(e?.message||e));
    }
  });
}
