import { google } from 'googleapis';
import { readFileSync } from 'fs';

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(readFileSync('./google-credentials.json', 'utf8')),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const sheets = google.sheets({ version: 'v4', auth });

export async function appendRow(sheetId, range, values) {
  try {
    const res = await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [values],
      },
    });
    return res.data;
  } catch (err) {
    console.error('❌ Error al enviar datos a Sheets:', err);
    throw err;
  }
}
