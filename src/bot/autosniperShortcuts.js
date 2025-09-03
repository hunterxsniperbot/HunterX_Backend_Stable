export function registerAutoSniperShortcuts(bot){
  const API_PORT = Number(process.env.API_PORT || 3000);
  const HX_KEY   = process.env.N8N_WEBHOOK_KEY || 'ponetuclaveultrasecreta';

  async function hxFetch(path, { method='GET', body=null, timeoutMs=1800, hdrs={} }={}){
    const ac = new AbortController();
    const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
    try{
      const r = await fetch(`http://127.0.0.1:${API_PORT}${path}`, {
        method,
        headers: { ...(body?{'content-type':'application/json'}:{}), ...hdrs },
        body: body ? JSON.stringify(body) : null,
        signal: ac.signal,
      });
      let json = null; try { json = await r.json(); } catch {}
      return { ok: r.ok, status: r.status, json };
    }catch(e){
      return { ok:false, status:null, json:{ ok:false, error:String(e?.message||e) } };
    }finally{ clearTimeout(t); }
  }

  function fmtStatus(J={}){
    const on   = !!(J.autosniper || J.running);
    const mode = String(J.mode || 'demo').toUpperCase();
    const cash = (J.cash ?? J?.balances?.demo?.cashUsd ?? 0);
    const inv  = (J.invested ?? J?.balances?.demo?.investedUsd ?? 0);
    const to2  = (x)=> (typeof x==='number' ? x.toFixed(2) : String(x));
    return (on ? '▶️ AutoSniper: ON' : '⏹️ AutoSniper: OFF')
         + ` • modo ${mode} • cash $${to2(cash)} • invested $${to2(inv)}`;
  }

  bot.onText(/^\s*\/autosniper_status(?:@[\w_]+)?\s*$/i, async (msg) => {
    const chatId = msg.chat.id;
    try { await bot.sendMessage(chatId, '⏳ consultando estado…'); } catch {}
    const s = await hxFetch('/api/autosniper/status');
    try { await bot.sendMessage(chatId, fmtStatus(s.json||{})); } catch {}
  });

  bot.onText(/^\s*\/autosniper_on(?:@[\w_]+)?\s*$/i, async (msg) => {
    const chatId = msg.chat.id;
    try { await bot.sendMessage(chatId, '⏳ encendiendo…'); } catch {}
    // modo: usa el actual si existe; si no, DEMO
    const st = await hxFetch('/api/autosniper/status');
    const mode = String(st?.json?.mode || 'DEMO').toUpperCase();
    await hxFetch('/api/autosniper/start', {
      method:'POST',
      body:{ mode },
      hdrs:{ 'x-hx-key': HX_KEY }
    });
    const s2 = await hxFetch('/api/autosniper/status');
    try { await bot.sendMessage(chatId, fmtStatus(s2.json||{})); } catch {}
  });

  bot.onText(/^\s*\/autosniper_off(?:@[\w_]+)?\s*$/i, async (msg) => {
    const chatId = msg.chat.id;
    try { await bot.sendMessage(chatId, '⏳ apagando…'); } catch {}
    await hxFetch('/api/autosniper/stop', { method:'POST', hdrs:{ 'x-hx-key': HX_KEY } });
    const s2 = await hxFetch('/api/autosniper/status');
    try { await bot.sendMessage(chatId, fmtStatus(s2.json||{})); } catch {}
  });
}
