// src/commands/hud.js — HUD en vivo (HTML)
import { buildMetrics } from '../services/positions.js';

const sleep = (ms)=> new Promise(r=>setTimeout(r,ms));
function fmtUSD(n){ return '$' + (Number(n||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function jitter(ms){ return Math.max(1000, Math.floor(ms * (0.9 + Math.random()*0.2))); }
function nextDelay({prevMs, changed, errorCount, baseMs}){
  if (errorCount>0) return Math.min((prevMs||baseMs)*1.5, 30000);
  return changed ? baseMs : Math.min((prevMs||baseMs)+2000, 15000);
}

async function snapshot(bot, uid){
  const mode = bot.realMode?.[uid] ? 'REAL' : 'DEMO';
  const storeDemo = bot._store_demo?.[uid] || [];
  const storeReal = bot._store_real?.[uid] || [];
  const m = await buildMetrics({ storeDemo, storeReal, max: 0 }); // solo totales

  const now = new Date(); const hh=String(now.getHours()).padStart(2,'0'); const mm=String(now.getMinutes()).padStart(2,'0'); const ss=String(now.getSeconds()).padStart(2,'0');
  const lines = [
    '<b>📊 HunterX — HUD</b>',
    `<i>${hh}:${mm}:${ss}</i>`,
    '',
    '<b>Resumen</b>',
    `• Modo: <b>${mode}</b>`,
    `• Abiertas — DEMO: <b>${m.demo.count}</b> · REAL: <b>${m.real.count}</b>`,
    `• DEMO — Invertido: <b>${fmtUSD(m.demo.invested)}</b> | Valor: <b>${fmtUSD(m.demo.now)}</b> | PnL: <b>${fmtUSD(m.demo.pnlAbs)}</b> (${m.demo.pnlPct.toFixed(2)}%)`,
    `• REAL — Invertido: <b>${fmtUSD(m.real.invested)}</b> | Valor: <b>${fmtUSD(m.real.now)}</b> | PnL: <b>${fmtUSD(m.real.pnlAbs)}</b> (${m.real.pnlPct.toFixed(2)}%)`,
    '',
    '<i>Refrescando…</i>'
  ];
  return lines.join('\n');
}

export default function registerHud(bot){
  bot._hudState = bot._hudState || {};

  bot.removeTextListener?.(/^\/hud(?:@[\w_]+)?/i);
  bot.onText(/^\/hud(?:@[\w_]+)?(?:\s+(stop|once|\d+))?\s*$/i, async (msg, m) => {
    const chatId = msg.chat.id; const uid = String(msg.from.id);
    const arg = (m[1]||'').toLowerCase();

    if (arg==='stop') {
      const st = bot._hudState[uid];
      if (st?.timer) { clearTimeout(st.timer); st.timer=null; }
      return bot.sendMessage(chatId, '⏹️ HUD detenido.', { parse_mode:'HTML' });
    }

    const baseMs = /^\d+$/.test(arg) ? Math.max(2000, Number(arg)*1000) : 8000;
    if (arg==='once') {
      const text = await snapshot(bot, uid);
      return bot.sendMessage(chatId, text, { parse_mode:'HTML' });
    }

    const st = bot._hudState[uid] = bot._hudState[uid] || {};
    if (st.timer) { clearTimeout(st.timer); st.timer=null; }

    const replyMarkup = {
      inline_keyboard: [[
        { text: `🔄 base ${Math.round(baseMs/1000)}s`, callback_data: 'hud:noop' },
        { text: '⏹️ Parar', callback_data: 'hud:stop' }
      ]]
    };

    let first = await snapshot(bot, uid);
    const sent = await bot.sendMessage(chatId, first, { parse_mode:'HTML', reply_markup: replyMarkup });
    st.prevText = first; st.delayMs=baseMs; st.errors=0;

    const tick = async () => {
      if (st.running) { st.timer=setTimeout(tick,jitter(1000)); return; }
      st.running=true;
      let changed=false;
      try{
        const fresh = await snapshot(bot, uid);
        if (fresh !== st.prevText){
          await bot.editMessageText(fresh, { chat_id: chatId, message_id: sent.message_id, parse_mode:'HTML', reply_markup: replyMarkup });
          st.prevText=fresh; changed=true;
        }
        st.errors=0;
      }catch{ st.errors=Math.min(st.errors+1,10); }
      finally{ st.running=false; }
      st.delayMs = nextDelay({ prevMs: st.delayMs, changed, errorCount: st.errors, baseMs });
      st.timer = setTimeout(tick, st.delayMs);
    };
    st.timer = setTimeout(tick, st.delayMs);
  });

  bot.on('callback_query', async (q)=>{
    const data = q.data || '';
    if (data==='hud:stop'){
      const uid = String(q.from.id);
      const st = bot._hudState?.[uid];
      if (st?.timer) { clearTimeout(st.timer); st.timer=null; }
      try{ await bot.answerCallbackQuery(q.id, { text:'HUD detenido.' }); }catch{}
    } else if (data==='hud:noop'){
      try{ await bot.answerCallbackQuery(q.id); }catch{}
    }
  });

  console.log('✅ Handler cargado: hud.js');
}
