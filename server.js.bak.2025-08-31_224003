import express from 'express';
import {
  startAutoSniper,
  stopAutoSniper,
  getHealthSnapshot,
  getWalletSummary,
} from './src/api/controllers.js';

const app = express();
app.use(express.json());

// Auth por header para rutas sensibles
function requireHxKey(req, res, next) {
  const need = process.env.N8N_WEBHOOK_KEY;
  if (!need) return res.status(500).json({ ok:false, error:'Missing N8N_WEBHOOK_KEY' });
  const got = req.get('x-hx-key');
  if (got !== need) return res.status(401).json({ ok:false, error:'bad key' });
  next();
}

// Salud (acepta ?fast=1)
app.get('/api/salud', async (req, res) => {
  try {
    const out = await getHealthSnapshot(req.query);
    res.json(out);
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// Start (protegido)
app.post('/api/autosniper/start', requireHxKey, async (req, res) => {
  try {
    const mode = req.body?.mode ?? 'DEMO'; // DEMO | REAL
    const out = await startAutoSniper(mode);
    res.json(out);
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// Stop (protegido)
app.post('/api/autosniper/stop', requireHxKey, async (_req, res) => {
  try {
    const out = await stopAutoSniper();
    res.json(out);
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// Status (solo lectura)
app.get('/api/autosniper/status', async (_req, res) => {
  try {
    const out = await getWalletSummary();
    res.json(out);
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

// Alias: /api/wallet (mismo contenido)
app.get('/api/wallet', async (_req, res) => {
  try {
    const out = await getWalletSummary();
    res.json(out);
  } catch (e) {
    res.status(500).json({ ok:false, error:String(e) });
  }
});

const PORT = Number(process.env.API_PORT || process.env.PORT || 3000);
app.listen(PORT, () => console.log('API escuchando en http://0.0.0.0:' + PORT));
