// src/commands/settings.js
export default function registerSettings(bot, { supabaseClient }) {
  bot.onText(/\/settings/, async (msg) => {
    const chatId = msg.chat.id;
    const userId = msg.from.id;

    // Aseguramos el objeto de config por usuario
    if (!bot.sniperConfig) bot.sniperConfig = {};
    let cfg = bot.sniperConfig[userId];

    // Si aún no hay, cargamos valores por defecto (o desde Supabase)
    if (!cfg) {
      // Aquí podrías leer de Supabase si quieres persistir:
      // const { data } = await supabaseClient.from('sniper_config')
      //   .select('param, value')
      //   .eq('user_id', userId);
      // Mapea data a cfg = { monto: ..., slippage: ..., scanInterval: ... , ... }
      cfg = {
        minAge:       1,        // minutos
        maxAge:       5,
        minLiquidity: 150,      // SOL
        maxFDV:       300_000,  // USD
        maxHolders:   400,
        minVolume:    1_500,    // USD/min
        monto:        100,      // USD
        slippage:     1.5,      // %
        scanInterval: 15_000,   // ms
        // los siguientes filtros “auto-ajustables” podrías sobreescribirlos
        // tras leer de tu tabla sniper_tuning
      };
      bot.sniperConfig[userId] = cfg;
    }

    // Construimos el mensaje con Markdown
    const text = [
      '⚙️ *Configuración del Sniper*',
      `⏱️ Edad token: *${cfg.minAge}–${cfg.maxAge} min*`,
      `💧 Liquidez mínima: *${cfg.minLiquidity} SOL*`,
      `📉 FDV máxima: *${cfg.maxFDV.toLocaleString()} USD*`,
      `👥 Holders máx.: *${cfg.maxHolders}*`,
      `📈 Volumen mín.: *$${cfg.minVolume.toLocaleString()} USD/min*`,
      `💰 Monto compra: *$${cfg.monto.toFixed(2)} USD*`,
      `💸 Slippage: *${cfg.slippage.toFixed(1)}%*`,
      `🔐 Contrato renunciado: *✅*`,
      `🛡️ Honeypot: *❌*`,
      `🐳 Whale detect: *✅*`,
      `⏱ Escaneo: *${(cfg.scanInterval/1000).toFixed(0)}s*`,
      `🕓 Horarios: *9–12 / 13–16 / 17–20 hs*`,
      `🛑 Stop Profit:`,
      `   +100% → 30%`,
      `   +250% → 125%`,
      `   +500% → 200%`,
      `   +750% → 300%`,
      `   +1000% → 400%`,
      `   +2000% → 800%`,
      `🛑 Stop Loss automático (scam)`
    ].join('\n');

    // Inline keyboard para cambiar ajustes
    const keyboard = {
      inline_keyboard: [
        [
          { text: '💰 Monto',       callback_data: `set_monto_${userId}` },
          { text: '📈 Volumen',     callback_data: `set_volume_${userId}` }
        ],
        [
          { text: '⚡ Intervalo',   callback_data: `set_interval_${userId}` },
          { text: '🔀 Slippage',    callback_data: `set_slippage_${userId}` }
        ],
        [
          { text: '🔧 Otros filtros', callback_data: `set_filters_${userId}` }
        ]
      ]
    };

    await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      reply_markup: keyboard
    });
  });
}
