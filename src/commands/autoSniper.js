// src/commands/autoSniper.js
import fetch from 'node-fetch';
import { PERFORMANCE_RULES } from '../modules/performanceRules.js';

export default function registerAutoSniper(bot, { quickNodeClient, phantomClient, supabaseClient, sheetsClient }) {
  let sniperIntervalId = null;

  bot.onText(/\/autosniper/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    if (sniperIntervalId) {
      return bot.sendMessage(chatId, '⚠️ El sniper ya está activo. Usa /detener para pararlo.');
    }

    if (!bot.sniperConfig) bot.sniperConfig = {};
    const cfg          = bot.sniperConfig[userId] || {};
    const scanInterval = cfg.scanInterval ?? 15000;
    const monto        = cfg.monto        ?? 100;
    const slippage     = cfg.slippage     ?? 1.5;

    await bot.sendMessage(chatId,
      `🤖 Sniper Automático ACTIVADO\n` +
      `⏱ Intervalo: ${scanInterval/1000}s  •  Monto: $${monto}  •  Slippage: ${slippage}%`
    );

    sniperIntervalId = setInterval(async () => {
      try {
        // 1) Escaneo + calculamos ageMinutes
        const rawTokens = await quickNodeClient.scanNewTokens();
        const now = Date.now();
        const tokens = rawTokens.map(t => ({
          ...t,
          ageMinutes: t.launchTimestamp
            ? (now - t.launchTimestamp) / 60_000
            : undefined
        }));
        console.log(`🔍 Encontrados ${tokens.length} tokens nuevos`);

        // DEBUG de los primeros 3 tokens con age calculada
        if (tokens.length) {
          const lines = tokens.slice(0,3).map((t,i) => {
            return `${i+1}. ${t.symbol} → ` +
                   `age:${t.ageMinutes?.toFixed(1)}m, ` +
                   `liq:${t.metrics.liquidity.toFixed(1)}, ` +
                   `FDV:${t.metrics.fdv.toFixed(0)}, ` +
                   `holders:${t.metrics.holders}, ` +
                   `vol:${t.metrics.volume.toFixed(0)}`;
          }).join('\n');
          await bot.sendMessage(chatId, `🐛 DEBUG tokens:\n${lines}`);
        }

        // 2) Filtrado usando ageMinutes correcto
        const candidates = tokens.filter(t =>
          t.ageMinutes       >= 1       &&
          t.ageMinutes       <= 5       &&
          t.metrics.liquidity >= 150     &&
          t.metrics.fdv       <= 300_000 &&
          t.metrics.holders   <= 400     &&
          t.metrics.volume    >= 1_500
        );
        console.log(`🎯 ${candidates.length} pasan filtros`);
        await bot.sendMessage(chatId, `🎯 ${candidates.length} pasan filtros`);

        if (!candidates.length) return;

        // 3) Realizar compras
        for (const tk of candidates) {
          const txSignature = await phantomClient.buyToken({
            mintAddress: tk.mintAddress,
            amount: monto,
            slippage
          });
          console.log('✅ Stub buyToken:', txSignature);

          // Registro en Supabase
          await supabaseClient.from('trades').insert([{
            user_id:       userId,
            token:         tk.symbol,
            amount_usd:    monto,
            price:         tk.currentPrice,
            tx_signature:  txSignature,
            pnl:           null
          }]);

          // Registro en Google Sheets
          await sheetsClient.appendRow([
            new Date().toISOString(),
            userId,
            tk.symbol,
            monto,
            tk.currentPrice,
            txSignature
          ]);

          // Notificación de compra
          await bot.sendMessage(chatId,
            `✅ COMPRA EJECUTADA\n` +
            `🪙 ${tk.symbol} • $${monto}\n` +
            `📥 ${tk.currentPrice.toFixed(6)}\n` +
            `🔐 ${txSignature}`
          );
        }

        // 4) Alertas de rendimiento
        if (!bot._lastPnl) bot._lastPnl = {};
        await monitorPositions(bot, userId, chatId, phantomClient);

      } catch (err) {
        console.error('Error en sniper loop:', err);
        await bot.sendMessage(chatId, `❌ Error en sniper loop: ${err.message}`);
      }
    }, scanInterval);
  });

  bot.onText(/\/detener/, (msg) => {
    const chatId = msg.chat.id;
    if (sniperIntervalId) {
      clearInterval(sniperIntervalId);
      sniperIntervalId = null;
      return bot.sendMessage(chatId, '🔴 Sniper Automático DETENIDO');
    }
    bot.sendMessage(chatId, '⚠️ El sniper no está activo.');
  });

  async function monitorPositions(bot, userId, chatId, phantomClient) {
    if (!bot._lastPnl) bot._lastPnl = {};
    const positions = await phantomClient.getOpenPositions(userId);
    for (const pos of positions) {
      if (!pos.entryPrice || !pos.currentPrice) continue;
      const pnlRatio = pos.currentPrice / pos.entryPrice;
      const last     = bot._lastPnl[pos.buyTxSignature] || 1;
      for (const rule of PERFORMANCE_RULES) {
        if (last >= rule.target && pnlRatio <= rule.trigger) {
          await bot.sendMessage(chatId,
            `🚨 *Alerta ${(rule.target*100).toFixed(0)}%*\n` +
            `${pos.tokenSymbol} cayó de ${(last*100).toFixed(0)}% a ${(pnlRatio*100).toFixed(0)}%.\n` +
            `Usá /cartera para cerrar.`,
            { parse_mode: 'Markdown' }
          );
          break;
        }
      }
      bot._lastPnl[pos.buyTxSignature] = pnlRatio;
    }
  }
}
