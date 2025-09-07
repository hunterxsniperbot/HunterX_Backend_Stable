// --- src/bot/demoCommands.ui.js ---
import { putTrade } from '../bot/tradeStore.js';
import { buy as demoBuy, sellPct as demoSellPct } from '../services/demoBankAdapter.js';
import { tmplBuyExecuted, tmplSellExecuted, kbTradeDefault } from './pushTemplates.js';

function num(n, d=2){ const x = Number(n||0); return isFinite(x) ? x.toFixed(d) : '0.00'; }

export function registerDemoCommandsUI(bot){
  // Limpio listeners previos para evitar duplicados
  bot.removeTextListener?.(/^\/demo_buy(?:\s+(\d+(?:\.\d+)?))?$/i);
  bot.removeTextListener?.(/^\/demo_sell(?:\s+(\d+(?:\.\d+)?))?(?:\s+([A-Z0-9_]+))?$/i);

  // /demo_buy [montoUsd]
  bot.onText(/^\/demo_buy(?:\s+(\d+(?:\.\d+)?))?$/i, async (msg, m) => {
    const chatId    = msg.chat.id;
    const amountUsd = Number(m?.[1] || 20);
    const price     = 200;                  // placeholder; tu lógica puede traer precio real
    const token     = 'SOL';

    const trade = await demoBuy({ token, amountUsd, priceUsd: price });
    const tradeId = trade?.id || ('demo-' + Date.now());

    const html = tmplBuyExecuted({
      MODO:'DEMO', trade_id: tradeId, symbol: token, mint_short:'So111…',
      route:'Raydium', slippage_bps: 50, fees_usd:'~0.01',
      size_usd: num(amountUsd,2), size_sol: num(amountUsd/price,6),
      entry_price_usd: num(price,4),
      buy_score_pct:'—', T1:'—', scam_score_pct:'—', scam_t1:'—',
      honeypot_emoji:'✅', liq_locked_emoji:'🔒', renounced_emoji:'🗝️', stale_emoji:'✅',
      tp_pct:'—', sl_pct:'—', cooldown_s:'—', ts_local: new Date().toLocaleString(),
      dexscreener_url:'#', jupiter_url:'#', raydium_url:'#', birdeye_url:'#', solscan_url:'#'
    });

    await bot.sendMessage(chatId, html, { parse_mode:'HTML', reply_markup: kbTradeDefault(tradeId) });
  });

  // /demo_sell [porcentaje] [TOKEN]
  bot.onText(/^\/demo_sell(?:\s+(\d+(?:\.\d+)?))?(?:\s+([A-Z0-9_]+))?$/i, async (msg, m) => {
    const chatId = msg.chat.id;
    const pct    = Number(m?.[1] || 100);
    const token  = m?.[2] || 'SOL';
    const price  = 220;                     // placeholder
    const r      = await demoSellPct?.({ token, pct, priceUsd: price }) || {};

    const html = tmplSellExecuted({
      MODO:'DEMO',
      kind: pct===100 ? 'TOTAL' : 'PARCIAL',
      trade_id: r.tradeId || ('demo-' + Date.now()),
      symbol: token,
      sold_usd: num(r.soldUsd,2), sold_pct: String(pct),
      remain_usd: num(r.remainUsd,2), remain_pct: String(Math.max(0,100-pct)),
      exit_price_usd: num(price,4), avg_exit_price_usd: r.avgExit? num(r.avgExit,4) : '-',
      realized_pnl_usd: num(r.realizedUsd,2), realized_pnl_pct: (r.realizedPct!=null? String(r.realizedPct)+'%' : '0%'),
      unreal_pnl_usd: num(r.unrealUsd,2), unreal_pnl_pct: (r.unrealPct!=null? String(r.unrealPct)+'%' : '0%'),
      hold_time: '—', ts_local: new Date().toLocaleString()
    });

    await bot.sendMessage(chatId, html, { parse_mode:'HTML', reply_markup: kbTradeDefault(r.tradeId || 'demo') });
  });

  // Callbacks NOP (responden y no rompen)
  bot.on('callback_query', async (q) => {
    const data = String(q.data || '');
    if (!/^pnl:|^sell:|^links:/.test(data)) return;
    try { await bot.answerCallbackQuery(q.id, { text: 'En construcción (DEMO UI PRO).' }); } catch {}
  });
}
export default { registerDemoCommandsUI };
