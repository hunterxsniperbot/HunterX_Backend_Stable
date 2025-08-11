// src/commands/ajustes.js — Seteo de perfil, montos base y STOP-LADDER (GIVEBACK)
const PRESET_LADDER = [
  { triggerUpPct: 100,  backToPct:  30,  sellPct: 100 },
  { triggerUpPct: 250,  backToPct: 125,  sellPct: 100 },
  { triggerUpPct: 500,  backToPct: 200,  sellPct: 100 },
  { triggerUpPct: 750,  backToPct: 300,  sellPct: 100 },
  { triggerUpPct: 1000, backToPct: 400,  sellPct: 100 },
  { triggerUpPct: 2000, backToPct: 800,  sellPct: 100 },
];

export default function registerAjustes(bot) {
  bot._settings   = bot._settings   || {};
  bot._stopLadder = bot._stopLadder || {};

  bot.onText(/^\/ajustes(?:\s+(.+))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);
    const args   = (match[1] || '').trim();

    const S = bot._settings[uid] = bot._settings[uid] || {
      profile: (process.env.PROFILE || 'strict').toLowerCase(),
      baseDemo: Number(process.env.SNIPER_BASE_DEMO_USD || 100),
      baseReal: Number(process.env.SNIPER_BASE_REAL_USD || 100),
    };
    const L = bot._stopLadder[uid] = bot._stopLadder[uid] || [...PRESET_LADDER];

    if (!args) {
      const ladderText = L.map(r => `• Peak ≥ *+${r.triggerUpPct}%* y actual ≤ *+${r.backToPct}%* → vender *${r.sellPct}%*`).join('\n');
      const text =
        `⚙️ *AJUSTES ACTUALES*\n` +
        `• Perfil: *${S.profile.toUpperCase()}*\n` +
        `• Base DEMO: $${S.baseDemo}\n` +
        `• Base REAL: $${S.baseReal}\n` +
        `• Stop-Ladder (GIVEBACK):\n${ladderText}\n\n` +
        `Comandos:\n` +
        `• /ajustes perfil strict|turbo\n` +
        `• /ajustes base demo 50   (o: real 100)\n` +
        `• /ajustes ladder preset       (carga tu escalera)\n` +
        `• /ajustes ladder clear        (borra todas las reglas)\n` +
        `• /ajustes ladder add  <triggerUp%> <backTo%> <sell%>\n` +
        `• /ajustes ladder show`;
      return bot.sendMessage(chatId, text, { parse_mode:'Markdown' });
    }

    const parts = args.split(/\s+/);

    // perfil
    if (parts[0].toLowerCase() === 'perfil' && parts[1]) {
      const v = parts[1].toLowerCase();
      if (!['strict','turbo'].includes(v)) {
        return bot.sendMessage(chatId, 'Perfil inválido (strict|turbo).');
      }
      S.profile = v;
      return bot.sendMessage(chatId, `Perfil seteado a *${v.toUpperCase()}*`, { parse_mode:'Markdown' });
    }

    // base demo/real
    if (parts[0].toLowerCase() === 'base' && parts[1] && parts[2]) {
      const side = parts[1].toLowerCase();
      const val  = Number(parts[2]);
      if (!Number.isFinite(val) || val <= 0) return bot.sendMessage(chatId, 'Monto inválido.');
      if (side === 'demo') S.baseDemo = Math.floor(val);
      else if (side === 'real') S.baseReal = Math.floor(val);
      else return bot.sendMessage(chatId, 'Usá: /ajustes base demo|real N');
      return bot.sendMessage(chatId, `Base *${side.toUpperCase()}* = $${Math.floor(val)}`, { parse_mode:'Markdown' });
    }

    // ladder
    if (parts[0].toLowerCase() === 'ladder') {
      if (parts[1]?.toLowerCase() === 'preset') {
        bot._stopLadder[uid] = [...PRESET_LADDER];
        return bot.sendMessage(chatId, 'Stop-Ladder: *preset cargado*', { parse_mode:'Markdown' });
      }
      if (parts[1]?.toLowerCase() === 'clear') {
        bot._stopLadder[uid] = [];
        return bot.sendMessage(chatId, 'Stop-Ladder: *limpio*', { parse_mode:'Markdown' });
      }
      if (parts[1]?.toLowerCase() === 'add' && parts[2] && parts[3] && parts[4]) {
        const T = Number(parts[2]); // triggerUp
        const B = Number(parts[3]); // backTo
        const SLL = Number(parts[4]); // sell%
        if (![T,B,SLL].every(x => Number.isFinite(x) && x >= 0 && x <= 10000)) {
          return bot.sendMessage(chatId, 'Usá: /ajustes ladder add <triggerUp%> <backTo%> <sell%>');
        }
        bot._stopLadder[uid].push({ triggerUpPct:T, backToPct:B, sellPct:SLL });
        return bot.sendMessage(chatId, `Ladder +: peak ≥ +${T}% y actual ≤ +${B}% → vender ${SLL}%`, { parse_mode:'Markdown' });
      }
      if (parts[1]?.toLowerCase() === 'show') {
        const L2 = bot._stopLadder[uid] || [];
        const txt = L2.length
          ? L2.map(r => `• Peak ≥ *+${r.triggerUpPct}%* y actual ≤ *+${r.backToPct}%* → vender *${r.sellPct}%*`).join('\n')
          : '— vacío —';
        return bot.sendMessage(chatId, `Stop-Ladder actual:\n${txt}`, { parse_mode:'Markdown' });
      }
      return bot.sendMessage(chatId, 'Usá: /ajustes ladder preset|clear|add|show');
    }

    return bot.sendMessage(chatId, 'Comando de /ajustes no reconocido.');
  });
}
