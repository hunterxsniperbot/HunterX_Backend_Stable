// src/commands/salud.js — "Conexiones activas" con auto-refresh + semáforo

const SLOTS = new Map(); // chatId -> { msgId, auto, timer, busy, lastHash }

const EMO = {
  ok: '🟢', warn: '🟡', err: '🔴', head: '🛰️', infra: '🏗️', data: '📚',
  refresh:'🔄', autoOn:'🟢 AUTO', autoOff:'⚪ AUTO'
};

const REFRESH_MS = Number(process.env.SALUD_REFRESH_MS || 12000); // 12s por defecto

function h(txt){ return txt; } // simple passthrough, mantenemos por claridad

function scoreToLight(s){ return s >= 85 ? EMO.ok : s >= 60 ? EMO.warn : EMO.err; }

function hash(s){ // hash simple para evitar edits innecesarios
  let h=0; for (let i=0;i<s.length;i++) h=((h<<5)-h)+s.charCodeAt(i), h|=0; return String(h);
}

async function safeFetch(url, {timeoutMs=2000, method='GET'}={}){
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
  try{
    const r = await fetch(url, {method, signal: ac.signal});
    return { ok: r.ok, status: r.status };
  }catch(e){ return { ok:false, error:String(e?.message||e) }; }
  finally{ clearTimeout(t); }
}

async function checkQuickNode(){
  const url = process.env.QUICKNODE_URL;
  if (!url) return {name:'QuickNode', ok:false, score:0, note:'Sin QUICKNODE_URL'};
  try{
    const ac = new AbortController();
    const t = setTimeout(()=>ac.abort('timeout'), 2500);
    const r = await fetch(url, {
      method:'POST',
      headers:{'content-type':'application/json'},
      body: JSON.stringify({jsonrpc:'2.0',id:1,method:'getSlot'}),
      signal: ac.signal
    });
    clearTimeout(t);
    const ok = r.ok;
    return {name:'QuickNode', ok, score: ok?95:0, note: ok?'RPC OK':'HTTP '+r.status};
  }catch(e){ return {name:'QuickNode', ok:false, score:0, note:String(e?.message||e)}}
}

async function checkHTTP(name, url){
  const r = await safeFetch(url, {timeoutMs:2000});
  const ok = !!r.ok;
  return { name, ok, score: ok?90:0, note: ok?('HTTP '+r.status): (r.error||('HTTP '+r.status)) };
}

async function snapshot(){
  const modePoll = 'POLLING'; // estás en polling local
  const infra = [];
  const data  = [];

  // INFRA
  infra.push({name:'TG mode',  ok:true,  score:100, note:modePoll});
  infra.push(await checkQuickNode());
  infra.push({name:'Phantom',  ok:!!process.env.PHANTOM_PK, score: process.env.PHANTOM_PK?80:0, note: process.env.PHANTOM_PK?'clave en .env':'sin clave'});
  infra.push({name:'Google Sheets', ok:!!process.env.GOOGLE_SHEETS_ID, score: process.env.GOOGLE_SHEETS_ID?70:0, note: process.env.GOOGLE_SHEETS_ID?'ID presente':'sin ID'});
  infra.push({name:'Render', ok:!!process.env.RENDER, score: process.env.RENDER?60:0, note: process.env.RENDER?'configurado':'local'});

  // FUENTES DE DATOS (HEAD/GET cortitos)
  data.push(await checkHTTP('DexScreener', 'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112'));
  data.push(await checkHTTP('Birdeye',    'https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112'));
  data.push(await checkHTTP('TokenSniffer','https://tokensniffer.com'));
  data.push(await checkHTTP('GoPlus',      'https://api.gopluslabs.io'));
  data.push(await checkHTTP('Whale Alert', 'https://api.whale-alert.io'));
  data.push(await checkHTTP('Solscan',     'https://public-api.solscan.io/account/tokens?account=11111111111111111111111111111111'));
  data.push(await checkHTTP('Jupiter',     'https://price.jup.ag/v6/price?ids=SOL'));
  data.push(await checkHTTP('Raydium',     'https://api.raydium.io/mint/list'));
  data.push(await checkHTTP('CoinGecko',   'https://api.coingecko.com/api/v3/ping'));
  data.push(await checkHTTP('CoinMarketCap','https://pro-api.coinmarketcap.com/v1/cryptocurrency/map'));
  data.push(await checkHTTP('Discord',     'https://discord.com/api/v10'));

  // Score global ponderado simple
  const all = [...infra, ...data];
  const avg = Math.round(all.reduce((a,x)=>a+(x.score||0),0) / Math.max(1, all.length));

  return { infra, data, avg };
}

function asLine(x){
  const light = scoreToLight(x.score||0);
  const score = (x.score||0).toString().padStart(2,' ');
  return `• ${x.name}: ${light} (${score}) ${x.note?'- '+x.note:''}`;
}

function build(body, slot){
  const kb = {
    inline_keyboard: [[
      { text: EMO.refresh+' Refrescar', callback_data: 'salud:refresh' },
      { text: (slot.auto? EMO.autoOn: EMO.autoOff), callback_data: 'salud:auto' }
    ]]
  };
  return { text: body, kb };
}

async function render(bot, chatId, force=false){
  const slot = SLOTS.get(chatId) || { auto:true };
  SLOTS.set(chatId, slot);

  if (slot.busy) return;
  slot.busy = true;

  try{
    const s = await snapshot();

    const head  = `${EMO.head} Conexiones activas`;
    const infra = `${EMO.infra} Infraestructura\n` + s.infra.map(asLine).join('\n');
    const data  = `${EMO.data} Fuentes de datos\n` + s.data.map(asLine).join('\n');
    const global= `\nScore global: ${scoreToLight(s.avg)} ${s.avg}/100`;

    const body  = [head, infra, data, global].join('\n\n');
    const { text, kb } = build(body, slot);
    const sig = hash(text + JSON.stringify(kb) + String(slot.auto));

    if (sig !== slot.lastHash || force){
      if (!slot.msgId){
        const m = await bot.sendMessage(chatId, text, { reply_markup: kb });
        slot.msgId = m.message_id;
      }else{
        await bot.editMessageText(text, { chat_id: chatId, message_id: slot.msgId, reply_markup: kb });
      }
      slot.lastHash = sig;
    }
  }catch(e){
    await bot.sendMessage(chatId, '❌ Salud: ' + (e?.message||e));
  }finally{
    slot.busy = false;
  }
}

function schedule(bot, chatId){
  const slot = SLOTS.get(chatId);
  clearTimeout(slot?.timer);
  if (slot?.auto){
    slot.timer = setTimeout(()=>render(bot, chatId), REFRESH_MS);
  }
}

export default function registerSalud(bot){
  // Alias: /salud y /health (para compatibilidad)
  bot.onText(/^\/(salud|health)\b/i, async (msg) => {
    const chatId = msg.chat.id;
    await render(bot, chatId, true);
    schedule(bot, chatId);
  });

  bot.on('callback_query', async (q)=>{
    const chatId = q.message?.chat?.id;
    const data   = String(q.data||'');
    if (!chatId || !data.startsWith('salud:')) return;

    const slot = SLOTS.get(chatId) || { auto:true };
    SLOTS.set(chatId, slot);

    if (data === 'salud:refresh'){
      await bot.answerCallbackQuery(q.id, { text:'Actualizando…' }).catch(()=>{});
      await render(bot, chatId, true);
      schedule(bot, chatId);
      return;
    }
    if (data === 'salud:auto'){
      slot.auto = !slot.auto;
      await bot.answerCallbackQuery(q.id, { text: 'Auto: ' + (slot.auto?'ON':'OFF') }).catch(()=>{});
      await render(bot, chatId, true);
      schedule(bot, chatId);
      return;
    }
  });
}
