// alter_trades.js
import 'dotenv/config';
import { Client } from 'pg';

async function run() {
  // Usa tu DATABASE_URL de .env
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // DDL: añade mint_address si no existe
  await client.query(`
    ALTER TABLE public.trades
    ADD COLUMN IF NOT EXISTS mint_address text;
  `);

  console.log('✅ Columna mint_address añadida correctamente');
  await client.end();
}

run().catch(err => {
  console.error('❌ Error en migración:', err);
  process.exit(1);
});
