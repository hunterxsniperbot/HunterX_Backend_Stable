/**
 * /candidatos [N]
 * Lista Top-N pools (por liquidez) desde marketsPref, con datos básicos.
 * No ejecuta compras; sirve para validar el feed y manualmente disparar /demo_buy.
 */
import { getSolanaPairs } from '../services/marketsPref.js';

function fmtUsd(n){ if(n==null) return '-'; return '$' + Number(n).toLocaleString('en-US', {maximumFractionDigits:2}); }
function cut(s){ return String(s||'').trim().replace(/\s+/g,' ').slice(0,16); }

export function registerCandidatos(bot){
  bot.onText(/^\/candidatos(?:\s+(\d+))?$/i, async (msg, m) => {
    const chatId = msg.chat.id;
    const topN = Math.max(1, Math.min(10, Number(m?.[1] || 5)));

    try{
      const pairs = await getSolanaPairs({ limit: Math.max(20, topN*4) });

      // Filtros mínimos para probar (ajustables luego)
      const minLiq = Number(process.env.MIN_LIQ_USD || 10000);   // $10k por defecto
      const maxFdv = Number(process.env.MAX_FDV_USD || 5_000_000); // $5M por defecto

      const cand = (pairs || [])
        .filter(p => (p.liquidityUsd ?? 0) >= minLiq)
        .filter(p => (p.fdvUsd == null || p.fdvUsd <= maxFdv))
        .slice(0, 100);

      if (!cand.length) {
        return bot.sendMessage(chatId, '⚠️ Sin candidatos con filtros mínimos. Probá más tarde o baja filtros.');
      }

      // Orden simple por liquidez descendente
      cand.sort((a,b)=> (b.liquidityUsd||0) - (a.liquidityUsd||0));

      const top = cand.slice(0, topN);

      const lines = ['<b>🎯 Candidatos (Top '+topN+')</b> (liq≥'+fmtUsd(minLiq)+', FDV≤'+fmtUsd(maxFdv)+')\n'];
      const kbs = [];

      for (let i=0;i<top.length;i++){
        const p = top[i];
        const sym = cut(`${p.baseSymbol}/${p.quoteSymbol}`);
        const liq = fmtUsd(p.liquidityUsd);
        const fdv = fmtUsd(p.fdvUsd);
        const px  = p.priceUsd == null ? '-' : ('$'+p.priceUsd.toPrecision(6));

        const ds = p.pairAddress ? `https://dexscreener.com/solana/${p.pairAddress}` : null;

        lines.push(`${i+1}. <b>${sym}</b>  liq ${liq}  FDV ${fdv}  px ${px}`);

        // Te dejo atajos: abrir DexScreener + textos útiles para copiar/pegar /demo_buy
        const row = [];
        if (ds) row.push({ text:'📊 DexScreener', url: ds });
        row.push({ text:'💜 /demo_buy 20', callback_data: `cand:hint:${i}:20` });
        row.push({ text:'💜 /demo_buy 50', callback_data: `cand:hint:${i}:50` });
        kbs.push(row);
      }

      const kb = { inline_keyboard: kbs };
      await bot.sendMessage(chatId, lines.join('\n'), { parse_mode:'HTML', disable_web_page_preview:true, reply_markup: kb });
    } catch(e){
      bot.sendMessage(chatId, '❌ candidatos error: '+(e?.message||e));
    }
  });

  // Callbacks de “hint”: sólo mandan un mensaje con el texto /demo_buy listo para enviar
  bot.on('callback_query', async (q)=>{
    const data = String(q.data||'');
    if (!data.startsWith('cand:hint:')) return;
    const chatId = q.message?.chat?.id;
    try{
      const [, , idx, amt] = data.split(':'); // cand:hint:<i>:<amount>
      await bot.answerCallbackQuery(q.id, { text:'Pegá y enviá el comando 😉' });
      await bot.sendMessage(chatId, `/demo_buy ${amt}`);
    } catch(e){
      try{ await bot.answerCallbackQuery(q.id, { text: 'Error: '+(e?.message||e) }); }catch{}
    }
  });
}
