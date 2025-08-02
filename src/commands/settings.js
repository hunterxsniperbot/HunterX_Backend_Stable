// src/commands/settings.js

/**
 * Módulo 4: /configurar
 * Permite recorrer y ajustar los parámetros del sniper.
 *
 * @param {TelegramBot} bot
 * @param {Object} services
 */
export default function settingsCommand(bot, services) {
  const params = [
    { key: 'liquidez', label: 'Liquidez mínima (SOL)',      step: 50,     unit: ' SOL'      },
    { key: 'fdv',       label: 'FDV máxima (USD)',          step: 50000,  unit: ' USD'      },
    { key: 'holders',   label: 'Holders máximos',           step: 50,     unit: ''          },
    { key: 'volumen',   label: 'Volumen mínimo (USD/min)',  step: 500,    unit: ' USD/min'  },
    { key: 'monto',     label: 'Monto de compra (USD)',     step: 5,      unit: ' USD'      }, // nuevo parámetro
    { key: 'slippage',  label: 'Slippage (%)',              step: 0.5,    unit: '%'         },
  ];

  // Al recibir /configurar
  bot.onText(/\/configurar/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Carga configuración previa o inicial
    const { data } = await services.supabaseClient
      .from('sniper_config')
      .select('param, value')
      .eq('user_id', userId);

    const config = {};
    params.forEach(p => {
      const row = data.find(r => r.param === p.key);
      // default: para 'slippage' y 'monto' ponemos valores iniciales razonables
      if (row) {
        config[p.key] = Number(row.value);
      } else if (p.key === 'slippage') {
        config[p.key] = 1.5;
      } else if (p.key === 'monto') {
        config[p.key] = 100;   // valor inicial de ejemplo
      } else {
        config[p.key] = p.step;
      }
    });

    // Guarda estado en memoria
    bot.sniperConfig = bot.sniperConfig || {};
    bot.sniperConfig[userId] = { index: 0, config };

    // Envía el primer parámetro
    await sendParam(bot, chatId, userId);
  });

  // Maneja los callbacks de los botones
  bot.on('callback_query', async (q) => {
    const chatId = q.message.chat.id;
    const userId = q.from.id;
    const action = q.data;
    const state  = bot.sniperConfig?.[userId];
    if (!state) return;

    let { index, config } = state;

    switch (action) {
      case 'prev':
        index = (index - 1 + params.length) % params.length;
        break;
      case 'next':
        index = (index + 1) % params.length;
        break;
      case 'dec':
        config[params[index].key] = Math.max(
          params[index].key === 'monto' ? 5 : -Infinity,
          config[params[index].key] - params[index].step
        );
        break;
      case 'inc':
        config[params[index].key] = Math.min(
          params[index].key === 'monto' ? 2000 : Infinity,
          config[params[index].key] + params[index].step
        );
        break;
      case 'save':
        const p = params[index];
        await services.supabaseClient
          .from('sniper_config')
          .upsert({
            user_id: userId,
            param:   p.key,
            value:   config[p.key]
          }, { onConflict: ['user_id','param'] });
        await bot.answerCallbackQuery(q.id, { 
          text: `${p.label} guardado: ${config[p.key]}${p.unit}` 
        });
        return;
      default:
        break;
    }

    state.index = index;
    // Reenvía el parámetro actualizado
    await sendParam(bot, chatId, userId, q.message.message_id);
    await bot.answerCallbackQuery(q.id);
  });

  // Función auxiliar: envía o edita mensaje de parámetro
  async function sendParam(bot, chatId, userId, messageId = null) {
    const { index, config } = bot.sniperConfig[userId];
    const p = params[index];
    const text = `⚙️ *${p.label}*: ${config[p.key]}${p.unit}`;
    const opts = {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '⬅️', callback_data: 'prev' },
            { text: '➖', callback_data: 'dec' },
            { text: '➕', callback_data: 'inc' },
            { text: '➡️', callback_data: 'next' }
          ],
          [{ text: '💾 Guardar', callback_data: 'save' }]
        ]
      }
    };
    if (messageId) {
      await bot.editMessageText(text, {
        chat_id:    chatId,
        message_id: messageId,
        ...opts
      });
    } else {
      await bot.sendMessage(chatId, text, opts);
    }
  }
}
