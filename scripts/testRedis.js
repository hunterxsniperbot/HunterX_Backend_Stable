// scripts/testRedis.js
import 'dotenv/config';
import { createClient } from 'redis';

(async () => {
  try {
    const client = createClient({
      url: process.env.REDIS_URL,
    });
    client.on('error', err => console.error('Redis Client Error', err));
    await client.connect();
    const pong = await client.ping();
    console.log('🔌 Redis PING:', pong);  // debe imprimir "PONG"
    await client.disconnect();
  } catch (err) {
    console.error('❌ Error conectando a Redis:', err.message);
    process.exit(1);
  }
})();
