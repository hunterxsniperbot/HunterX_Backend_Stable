// test_tcp.js
import 'dotenv/config';
import { Client } from 'pg';

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('✅ Conexión TCP Exitosa a Postgres');
  } catch (err) {
    console.error('❌ Error TCP:', err.message);
  } finally {
    await client.end();
  }
})();
