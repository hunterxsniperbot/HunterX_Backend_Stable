export function registerAutoSniperImmediate(bot){
  const API_PORT = Number(process.env.API_PORT || 3000);

  async function hxFetch(path, { method='GET', body=null, timeoutMs=1800 }={}){
    const ac = new AbortController();
    const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
    try{
      const r = await fetch(`http://127.0.0.1:${API_PORT}${path}`, {
        method,
        headers: body ? {'content-type':'application/json'} : undefined,
        body: body ? JSON.stringify(body) : null,
        signal: ac.signal,
      });
      let json = null; try { json = await r.json(); } catch {}
      return { ok: r.ok, status: r.status, json };
    }catch(e){
      return { ok:false, status:null, json:{ ok:false, error:String(e?.message||e) } };
    }finally{
      clearTimeout(t);
    }
  }

  // Unificado: /autosniper [on|off|stop|status]
  bot.onText(/^\s*\/autosniper(?:@[\w_]+)?(?:\s+(on|off|stop|status))?\s*$/i, async (msg, m) => {
    const chatId = msg.chat.id;
    const arg = ((m && m[1]) ? m[1] : '').trim().toLowerCase() || 'status';

    // 1) ACK inmediato
    try { await bot.sendMessage(chatId, `⏳ /autosniper ${arg} recibido`); } catch {}

    // 2) Esperá breve para que el handler original ejecute (si corresponde)
    await new Promise(r => setTimeout(r, 300));

    // 3) Status actualizado desde tu API local
    const s = await hxFetch('/api/autosniper/status');
    const J = s?.json || {};
    const on = !!(J.autosniper || J.running);
    const mode = String(J.mode || 'demo').toUpperCase();

    const cash = (J.cash ?? J?.balances?.demo?.cashUsd ?? 0);
    const inv  = (J.invested ?? J?.balances?.demo?.investedUsd ?? 0);

    const to2  = (x)=> (typeof x==='number' ? x.toFixed(2) : String(x));

    const txt = [
      on ? '▶️ AutoSniper: ON' : '⏹️ AutoSniper: OFF',
      `modo ${mode}`,
      `cash $${to2(cash)}`,
      `invested $${to2(inv)}`
    ].join(' • ');

    try { await bot.sendMessage(chatId, txt); } catch {}
  });
}
