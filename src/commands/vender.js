// src/commands/vender.js — venta manual ultra-rápida
import { sellFast } from '../services/fastsell.js';

export default function registerVender(bot) {
  const USAGE = 'Uso: /vender <cantidad|porcentaje|all> <mint>\n' +
                'Ejemplos:\n' +
                '  /vender all <MINT>\n' +
                '  /vender 50% <MINT>\n' +
                '  /vender 1.23 <MINT>   (tokens)\n';

  bot.onText(/^\/(vender|sell)\b(?:\s+(.+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const args = (match?.[2]||'').trim().split(/\s+/).filter(Boolean);

    if (args.length<2) {
      await bot.sendMessage(chatId, '✋ Venta rápida\n\n'+USAGE, { reply_to_message_id: msg.message_id }).catch(()=>{});
      return;
    }
    const amount = args[0];
    const mint = args[1];

    // ACK inmediato
    const ack = await bot.sendMessage(chatId, `⏱️ Vendiendo rápido…\n• MINT: \`${mint}\`\n• CANT: \`${amount}\`\n(slippage ${process.env.FASTSELL_SLIPPAGE_BPS||100} bps)`, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_to_message_id: msg.message_id,
    }).catch(()=>null);

    const t0 = Date.now();
    try {
      const r = await sellFast({ mint, amountInput: amount });
      const ms = Date.now()-t0;

      const solscan = `https://solscan.io/tx/${encodeURIComponent(r.signature)}?cluster=mainnet`;
      const outUSDC = Number(r.expectedOut)/1e6;
      const lines = [
        r.simulated ? '🧪 DEMO (no transmitido)' : '✅ Enviada',
        `⏱️ ${ms} ms`,
        `💵 out ≈ ${outUSDC.toFixed(2)} USDC`,
        `📈 route: ${r.routeInfo?.timeTaken ?? 'n/a'} ms`,
        `🧷 sig: \`${r.signature}\``,
        r.simulated ? '' : `[Ver en Solscan](${solscan})`
      ].filter(Boolean).join('\n');

      const body = `**Venta rápida**\n${lines}`;
      if (ack) {
        await bot.editMessageText(body, {
          chat_id: ack.chat.id, message_id: ack.message_id,
          parse_mode: 'Markdown',
          disable_web_page_preview: false,
        }).catch(()=>{});
      } else {
        await bot.sendMessage(chatId, body, { parse_mode: 'Markdown', disable_web_page_preview: false }).catch(()=>{});
      }
    } catch (e) {
      const em = String(e?.message || e);
      const body = `❌ Venta fallida\n\`${em}\`\n\n${USAGE}`;
      if (ack) {
        await bot.editMessageText(body, { chat_id: ack.chat.id, message_id: ack.message_id, parse_mode: 'Markdown' }).catch(()=>{});
      } else {
        await bot.sendMessage(chatId, body, { parse_mode: 'Markdown' }).catch(()=>{});
      }
    }
  });
}
