import { getSolanaPairs } from '../services/marketsPref.js';

function to2(x){ return typeof x==='number' ? x.toFixed(6) : 'N/A'; }
function fmtUsd(x){ return (typeof x==='number') ? ('$'+(x>=1? x.toFixed(3): x.toPrecision(3))) : 'N/A'; }

export function registerCandidatos(bot){
  // cache simple 10s para no spamear
  let last = { ts: 0, data: [] };

  bot.onText(/^\s*\/candidatos\b/i, async (msg) => {
    const chatId = msg.chat.id;
    try{
      const now = Date.now();
      if (now - last.ts > 10_000) {
        const raw = await getSolanaPairs({ limit: 20 });
        // mínimos datos: precio conocido
        last.data = (raw||[]).filter(p => typeof p.priceUsd === 'number');
        last.ts = now;
      }
      const cand = last.data.slice(0,3);
      if (!cand.length){
        return bot.sendMessage(chatId, '😕 No hay candidatos M4 ahora. Probá de nuevo en unos segundos.');
      }
      let txt = '🎯 *Top Candidatos M4*\n';
      const kb = [];
      cand.forEach((p, i) => {
        const name = `${p.baseSymbol||'Token'}${p.quoteSymbol?'/'+p.quoteSymbol:''} (${p.source||'src'})`;
        txt += `\n${i+1}. *${name}*\n` +
               `💵 Precio: ${fmtUsd(p.priceUsd)}\n` +
               `💧 Liquidez: ${fmtUsd(p.liquidityUsd)}\n` +
               `🏷️ FDV: ${fmtUsd(p.fdvUsd)}\n`;
        kb.push([
          { text: `🟣 Buy DEMO $10 (${p.baseSymbol||'Token'})`, callback_data: `demo:buy:10:${p.baseSymbol||'Token'}` },
          { text: `🟣 $50`, callback_data: `demo:buy:50:${p.baseSymbol||'Token'}` },
          ...(p.links?.gecko ? [{ text: '🔎 Ficha', url: p.links.gecko }] : [])
        ]);
      });

      await bot.sendMessage(chatId, txt, {
        parse_mode:'Markdown',
        disable_web_page_preview: true,
        reply_markup: { inline_keyboard: kb }
      });
    }catch(e){
      await bot.sendMessage(chatId, '❌ Error en /candidatos: '+String(e?.message||e));
    }
  });

  // callbacks de compra DEMO (reusan /demo_buy para no duplicar lógica)
  bot.on('callback_query', async (q) => {
    const chatId = q.message?.chat?.id;
    const data = String(q.data||'');
    if (!chatId || !data.startsWith('demo:buy:')) return;
    try{
      const parts = data.split(':'); // demo:buy:<amount>:<SYMBOL>
      const amount = parts[2] || '10';
      const sym = (parts[3] || 'SOL').replace(/[^A-Z0-9_]/gi,'').toUpperCase();
      await bot.answerCallbackQuery(q.id, { text: `Comprando DEMO $${amount} ${sym}…` });
      // disparamos el comando normal (tu handler /demo_buy ya existe)
      await bot.sendMessage(chatId, `/demo_buy ${amount} ${sym}`);
    }catch{}
  });
}
