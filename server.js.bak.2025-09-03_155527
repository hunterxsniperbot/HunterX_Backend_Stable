import express from 'express';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

// Ping simple
app.get('/api/health', (_req,res)=>res.json({ ok:true, ts:Date.now() }));

const HX_KEY = process.env.N8N_WEBHOOK_KEY || '';
function requireHxKey(req,res,next){
  if (HX_KEY && req.headers['x-hx-key'] !== HX_KEY) {
    return res.status(401).json({ ok:false, error:'unauthorized' });
  }
  next();
}

app.get('/api/autosniper/status', async (_req,res)=>{
  try{
    let summary = null;
    try{
      const st = await import('./src/services/state.js');
      if (st.getWalletSummary) summary = await st.getWalletSummary();
      else if (st.getState) {
        const s = await st.getState();
        summary = { ok:true, mode: s?.mode || 'demo', autosniper: !!(globalThis.bot?._sniperOn) };
      }
    }catch{}
    if (!summary) summary = { ok:true, mode:'demo', autosniper: !!(globalThis.bot?._sniperOn) };
    res.json(summary);
  }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
});

app.post('/api/autosniper/start', requireHxKey, async (req,res)=>{
  try{
    globalThis.bot = globalThis.bot || {};
    globalThis.bot._sniperOn = globalThis.bot._sniperOn || {};
    const uid = String(process.env.ADMIN_UID || 'local');
    globalThis.bot._sniperOn[uid] = true;
    res.json({ ok:true, mode:String(req.body?.mode||'DEMO').toUpperCase(), autosniper:true, running:true });
  }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
});

app.post('/api/autosniper/stop', requireHxKey, async (_req,res)=>{
  try{
    const uid = String(process.env.ADMIN_UID || 'local');
    if (globalThis.bot?._sniperLoops?.[uid]) { clearInterval(globalThis.bot._sniperLoops[uid]); delete globalThis.bot._sniperLoops[uid]; }
    if (globalThis.bot?._sniperOn) globalThis.bot._sniperOn[uid] = false;
    res.json({ ok:true, autosniper:false, running:false });
  }catch(e){ res.status(500).json({ ok:false, error:String(e) }); }
});

const PORT = Number(process.env.API_PORT || process.env.PORT || 3000);
if (!globalThis.__HX_API_SERVER) {
  const server = app.listen(PORT, '0.0.0.0', ()=> {
    console.log(`🌐 API escuchando en http://0.0.0.0:${PORT}`);
  });
  globalThis.__HX_API_SERVER = server;
}

export default app;
