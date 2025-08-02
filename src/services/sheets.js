// src/services/sheets.js
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

export default function SheetsService({ credentialsPath, sheetId }) {
  const fullPath = path.isAbsolute(credentialsPath)
    ? credentialsPath
    : path.join(process.cwd(), credentialsPath);
  const creds = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
  const auth = new google.auth.GoogleAuth({
    credentials: creds,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  return {
    ping: async () => {
      await sheets.spreadsheets.values.get({
        spreadsheetId: sheetId,
        range: 'A1:A1'
      });
      return true;
    },

    /**
     * Añade una fila con [timestamp, user, token, amount, price, tx]
     */
    appendRow: async (row) => {
      await sheets.spreadsheets.values.append({
        spreadsheetId: sheetId,
        range: 'A:A',
        valueInputOption: 'RAW',
        requestBody: { values: [row] }
      });
    }
  };
}
