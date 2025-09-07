import { sellPct as demoSellPct, getState as demoGetState } from '../services/demoBankAdapter.js';
import { tmplSellExecuted, kbTradeDefault } from '../bot/pushTemplates.js';
import { getTrade } from '../bot/tradeStore.js';

export default function registerDemoCallbacks(bot){
  bot.on('callback_query', async (q) => {
    const data   = String(q.data||'');
    const chatId = q.message?.chat?.id;
    const msgId  = q.message?.message_id;

    try {
      // PnL rápido (toast)
      if (data.startsWith('pnl:')) {
        const id  = data.split(':')[1];
        const tr  = getTrade(id);
        const st  = await demoGetState();
        let text  = 'PnL: —';

        if (tr && st && Array.isArray(st.positions)) {
          const pos   = st.positions.find(p => String(p.token||p.symbol||'').toUpperCase() === String(tr.token||'SOL'));
          if (pos) {
            const entry = Number(pos.priceIn||0);
            const last  = Number(pos.lastPriceUsd||entry||0);
            const pct   = entry ? ((last-entry)/entry*100).toFixed(2) : '0.00';
            text = `PnL ${pos.token||'SOL'}: ${pct}%`;
          }
        }
        await bot.answerCallbackQuery(q.id, { text, show_alert:false });
        return;
      }

      // Venta parcial/total
      if (data.startsWith('sell:')) {
        const [, id, pctStr] = data.split(':');
        const pct   = Number(pctStr||'100');
        const tr    = getTrade(id) || { token:'SOL' };
        const token = tr.token || 'SOL';

        const r = await demoSellPct({ token, pct, priceUsd: 220 });
        const html = tmplSellExecuted({
          MODO:'DEMO', kind: pct===100?'TOTAL':'PARCIAL', trade_id: id || r.tradeId || 'demo',
          symbol: token,
          sold_usd: (r.soldUsd||0).toFixed(2), sold_pct: String(pct),
          remain_usd: (r.remainUsd||0).toFixed(2), remain_pct: String(Math.max(0,100-pct)),
          exit_price_usd:'220.0000', avg_exit_price_usd:r.avgExit?.toFixed(4)||'-',
          realized_pnl_usd:(r.realizedUsd||0).toFixed(2), realized_pnl_pct: (r.realizedPct||'0')+'%',
          unreal_pnl_usd:(r.unrealUsd||0).toFixed(2),   unreal_pnl_pct: r.unrealPct? r.unrealPct+'%' : '0%',
          hold_time:'—', ts_local:new Date().toLocaleString()
        });

        await bot.editMessageText(html, { chat_id: chatId, message_id: msgId, parse_mode:'HTML', reply_markup: kbTradeDefault(id) });
        await bot.answerCallbackQuery(q.id, { text:`Vendido ${pct}%`, show_alert:false });
        return;
      }
    } catch (e) {
      try { await bot.answerCallbackQuery(q.id, { text: String(e.message||e), show_alert:true }); } catch {}
    }
  });
}
