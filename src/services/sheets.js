// src/services/sheets.js
import { google } from 'googleapis';

export default function SheetsService({ credentialsPath, sheetId }) {
  const auth = new google.auth.GoogleAuth({
    keyFile: credentialsPath,
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const sheetsApi = google.sheets({ version: 'v4', auth });

  return {
    sheetId,

    async appendRow(values, attempt = 1) {
      try {
        await sheetsApi.spreadsheets.values.append({
          spreadsheetId: this.sheetId,
          range: 'A:A',
          valueInputOption: 'RAW',
          requestBody: { values: [values] }
        });
        console.log(`✅ Fila anexada a Google Sheets: ${values}`);
      } catch (err) {
        if (attempt < 4) {
          const backoffMs = 500 * Math.pow(2, attempt);
          console.warn(
            `⚠️ Google Sheets appendRow falló (intento ${attempt}): ${err.code||err.message}` +
            ` — reintentando en ${backoffMs}ms…`
          );
          await new Promise(r => setTimeout(r, backoffMs));
          return this.appendRow(values, attempt + 1);
        }
        console.error('❌ Google Sheets appendRow definitivamente falló:', err);
      }
    }
  };
}
