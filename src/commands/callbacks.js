// src/commands/callbacks.js
export default function registerCallbacks(bot) {
  // 1) Manejo de pulsaciones inline_keyboard
  bot.on('callback_query', async (query) => {
    const data   = query.data;
    const chatId = query.message.chat.id;
    const userId = String(query.from.id);

    if (!data.endsWith(`_${userId}`)) {
      return bot.answerCallbackQuery(query.id, { text: 'Este botón no es para ti.' });
    }

    if (!bot.sniperConfig) bot.sniperConfig = {};
    if (!bot.sniperConfig[userId]) bot.sniperConfig[userId] = {};
    const cfg = bot.sniperConfig[userId];

    // — Toggle booleans —
    if (data.startsWith('toggle_')) {
      const field = data.split('_')[1];
      cfg[field] = !cfg[field];
      await bot.answerCallbackQuery(query.id);
      return bot.sendMessage(chatId,
        `✅ *${field}* ahora está *${cfg[field] ? '✅' : '❌'}*.`,
        { parse_mode:'Markdown' }
      );
    }

    // — Preparar para lectura de nuevo valor —
    let field, prompt;
    if (data.startsWith('set_minLiquidity_')) {
      field = 'minLiquidity';   prompt = 'Ingresa *Liquidez mínima* (SOL)';
    } else if (data.startsWith('set_maxFDV_')) {
      field = 'maxFDV';         prompt = 'Ingresa *FDV máxima* (USD)';
    } else if (data.startsWith('set_maxHolders_')) {
      field = 'maxHolders';     prompt = 'Ingresa *Holders máximos*';
    } else if (data.startsWith('set_minVolume_')) {
      field = 'minVolume';      prompt = 'Ingresa *Volumen mínimo* (USD/min)';
    } else if (data.startsWith('set_monto_')) {
      field = 'monto';          prompt = 'Ingresa *Monto de compra* (USD)';
    } else if (data.startsWith('set_slippage_')) {
      field = 'slippage';       prompt = 'Ingresa *Slippage* (%)';
    } else if (data.startsWith('set_scanInterval_')) {
      field = 'scanInterval';   prompt = 'Ingresa *Intervalo de escaneo* (segundos)';
    } else if (data.startsWith('set_timeWindows_')) {
      field = 'timeWindows';    prompt = 'Ingresa *Horarios* ej: `9-12,13-16,17-20`';
    } else if (data.startsWith('set_stopRules_')) {
      field = 'stopRules';      prompt = 'Ingresa *Stop Rules* JSON: `[{"target":1,"trigger":0.3},…]`';
    } else {
      return bot.answerCallbackQuery(query.id);
    }

    cfg.waitingFor = field;
    await bot.answerCallbackQuery(query.id);
    await bot.sendMessage(chatId, `✏️ ${prompt}`, { parse_mode:'Markdown' });
  });

  // 2) Lectura del siguiente mensaje como nuevo valor
  bot.on('message', async (msg) => {
    const chatId = msg.chat.id;
    const userId = String(msg.from.id);
    const text   = msg.text?.trim();
    const cfg    = bot.sniperConfig?.[userId];
    if (!cfg?.waitingFor || !text) return;

    const field = cfg.waitingFor;
    let val;
    try {
      if (['minLiquidity','maxHolders','monto','maxFDV','minVolume'].includes(field)) {
        val = parseFloat(text);
        if (isNaN(val) || val < 0) throw new Error();
      } else if (field === 'slippage') {
        val = parseFloat(text);
        if (isNaN(val) || val < 0 || val > 100) throw new Error();
      } else if (field === 'scanInterval') {
        val = parseFloat(text) * 1000;
        if (isNaN(val) || val < 1000) throw new Error();
      } else if (field === 'timeWindows') {
        val = text.split(',').map(part => {
          const [f,t] = part.split('-').map(n=>parseInt(n,10));
          if (isNaN(f)||isNaN(t)) throw new Error();
          return { from:f, to:t };
        });
      } else if (field === 'stopRules') {
        val = JSON.parse(text);
        if (!Array.isArray(val)) throw new Error();
      }
    } catch {
      return bot.sendMessage(chatId, `❌ Valor inválido para *${field}*.`, { parse_mode:'Markdown' });
    }

    cfg[field] = val;
    delete cfg.waitingFor;

    await bot.sendMessage(chatId,
      `✅ *${field}* actualizado a *${Array.isArray(val)? JSON.stringify(val) : val}*.`,
      { parse_mode:'Markdown' }
    );
  });
}
