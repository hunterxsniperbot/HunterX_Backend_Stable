import { google } from 'googleapis';
import { readFile } from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const SHEET_ID = process.env.GOOGLE_SHEETS_ID;
const CREDENTIALS_PATH = process.env.GOOGLE_SHEETS_CREDENTIALS || './google-credentials.json';

async function testGoogleSheets() {
  try {
    const content = await readFile(CREDENTIALS_PATH);
    const credentials = JSON.parse(content);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    const response = await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'A1',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [['✅ Test desde script - HunterX conectado']],
      },
    });

    console.log('📄 Test enviado correctamente a Google Sheets ✅');
    console.log(response.data);
  } catch (err) {
    console.error('❌ Error en testSheets:', err.message);
  }
}

testGoogleSheets();
