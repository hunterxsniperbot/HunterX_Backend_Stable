// src/server.js
import 'dotenv/config';
import express from 'express';
import bodyParser from 'body-parser';
import { queueTask } from './services/queue.js';  // ejemplo de cola
import { getDexScreenerPairs } from './api/dexscreener.js';

const app = express();
app.use(bodyParser.json());

// Health check
app.get('/health', (req, res) => res.send('OK'));

// Endpoint para iniciar sniper
app.post('/sniper/start', async (req, res) => {
  const { userId, module } = req.body;
  await queueTask('startSniper', { userId, module });
  res.json({ status: 'sniper queued' });
});

// Endpoint de prueba DexScreener
app.get('/dex/pairs', async (req, res) => {
  const pairs = await getDexScreenerPairs();
  res.json({ count: pairs.length, pairs });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server listening on port ${PORT}`);
});
