// src/commands/cartera.js

/**
 * Módulo 6: Venta Manual desde /cartera
 * - Lista posiciones abiertas
 * - Muestra botones de venta parcial (25/50/75/100%) y enlaces
 * - Maneja cortes de red con mensaje de reintento
 */

import { supabaseClient, phantomClient } from '../services/index.js';

export default function carteraCommand(bot) {
  bot.onText(/\/cartera/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Enviar mensaje provisional
    const loadingMsg = await bot.sendMessage(chatId, '⏳ Cargando tu cartera, un momento…');

    let positions, wallet;
    try {
      positions = await phantomClient.getOpenPositions(userId);
      wallet    = await phantomClient.getWalletBalance(userId);
    } catch (err) {
      console.error('❌ Error de red al obtener cartera:', err);
      return bot.sendMessage(
        chatId,
        '⚠️ No pude recuperar tus posiciones en este momento. ' +
        'Reintentá en unos segundos con /cartera, por favor.'
      );
    }

    // Borrar mensaje provisional
    await bot.deleteMessage(chatId, loadingMsg.message_id);

    if (!positions || positions.length === 0) {
      return bot.sendMessage(chatId, '📭 No tienes posiciones abiertas actualmente.');
    }

    // Mostrar cada posición con botones
    for (const pos of positions) {
      const pnlPerc = ((pos.currentPrice - pos.entryPrice) / pos.entryPrice) * 100;
      const pnlUsd  = (pos.amountUsd * pnlPerc / 100).toFixed(2);
      const arrow   = pnlPerc >= 0 ? '📈' : '📉';

      const text =
        `🪙 *${pos.tokenSymbol}*\n` +
        `📥 Entrada: ${pos.entryPrice}\n` +
        `📤 Actual: ${pos.currentPrice}\n\n` +
        `💵 Invertido: ${pos.amountUsd} USD\n` +
        `${arrow} *PnL:* ${pnlPerc.toFixed(2)}% (${arrow}${pnlUsd} USD)`;

      const keyboard = {
        inline_keyboard: [
          [
            { text: '🔁 25%', callback_data: `sell_25_${pos.tokenMint}` },
            { text: '🔁 50%', callback_data: `sell_50_${pos.tokenMint}` }
          ],
          [
            { text: '🔁 75%', callback_data: `sell_75_${pos.tokenMint}` },
            { text: '💯 Vender', callback_data: `sell_100_${pos.tokenMint}` }
          ],
          [
            { text: '📊 DexScreener', url: `https://dexscreener.com/solana/${pos.tokenMint}` },
            { text: '📎 Solscan',      url: `https://solscan.io/token/${pos.tokenMint}` }
          ]
        ]
      };

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: keyboard
      });
    }

    // Resumen de wallet
    const resumen =
      `💳 *Phantom Wallet*\n\n` +
      `- Total disponible: ${wallet.totalUsd} USD\n` +
      `- Invertido actualmente: ${wallet.investedUsd} USD\n` +
      `- Libre para sniper: ${wallet.freeUsd} USD`;

    await bot.sendMessage(chatId, resumen, { parse_mode: 'Markdown' });
  });

  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const [ , pct, mint ] = query.data.split('_');
    const userId = query.from.id;

    if (!['25','50','75','100'].includes(pct)) {
      return bot.answerCallbackQuery(query.id, { text: 'Parámetro inválido.' });
    }
    await bot.answerCallbackQuery(query.id);

    try {
      const pos = await phantomClient.getPosition(userId, mint);
      if (!pos) throw new Error('Posición no encontrada');
      const fraction = parseInt(pct, 10) / 100;
      const amountToSell = pos.amountToken * fraction;

      const txSignature = await phantomClient.sellToken({
        mint:     mint,
        amount:   amountToSell,
        slippage: 1.5
      });

      // Actualizar PnL en Supabase (intenta con retry internamente)
      const pnlValue = (pos.currentPrice - pos.entryPrice) * amountToSell;
      await supabaseClient
        .from('trades')
        .update({ pnl: pnlValue })
        .eq('tx_signature', pos.buyTxSignature);

      await bot.sendMessage(
        chatId,
        `✅ Vendido *${pct}%* de ${pos.tokenSymbol}\n` +
        `Tokens vendidos: ${amountToSell.toFixed(4)}\n` +
        `Tx: ${txSignature}`,
        { parse_mode: 'Markdown' }
      );
    } catch (err) {
      console.error('Error en callback de venta:', err);
      await bot.sendMessage(chatId, '❌ No se pudo procesar la venta.');
    }
  });
}
