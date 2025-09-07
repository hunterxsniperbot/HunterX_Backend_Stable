import { discoverTop } from '../services/candidatesGecko.js';

const ENV = {
  M4_TICK_MS: Number(process.env.M4_TICK_MS || 15000),
  M4_BROADCAST_TTL_S: Number(process.env.M4_BROADCAST_TTL_S || 600),
  CAND_TOP: Number(process.env.CAND_TOP || 3),
};

function fmtMoney(n) {
  if (!isFinite(n)) return 'N/A';
  if (n >= 1e6) return (n/1e6).toFixed(1)+'M';
  if (n >= 1e3) return (n/1e3).toFixed(1)+'k';
  return n.toFixed(0);
}

export function registerM4Broadcaster(bot) {
  // recordar el chatId más reciente por usuario
  bot._lastChatId = bot._lastChatId || {};
  bot.on('message', (msg) => {
    try { bot._lastChatId[String(msg.from.id)] = msg.chat.id; } catch {}
  });

  bot._lastM4Ts   = bot._lastM4Ts   || {};
  bot._lastM4Hash = bot._lastM4Hash || {};

  setInterval(async () => {
    try {
      const map = bot._sniperOn || {};
      for (const [uid, on] of Object.entries(map)) {
        if (!on) continue;                       // solo usuarios con sniper ON
        const chatId = bot._lastChatId[uid];
        if (!chatId) continue;                   // sin chat destino => saltar

        const now  = Date.now();
        const last = bot._lastM4Ts[uid] || 0;
        if (now - last < ENV.M4_BROADCAST_TTL_S * 1000) continue;  // respeta TTL

        const all = await discoverTop().catch(() => null);
        if (!all || all.length === 0) continue;

        const top = all.slice(0, ENV.CAND_TOP);
        const hash = JSON.stringify(top.map(x => [x.pairAddress, x.priceUsd, x.liqUsd, x.fdvUsd]));
        if (hash === bot._lastM4Hash[uid]) {     // nada cambió, no spamear
          bot._lastM4Ts[uid] = now;
          continue;
        }

        const body = top.map((c,i)=> 
`${i+1}. $${c.sym} *(gecko)*
💵 Precio: $${(+c.priceUsd||0).toFixed(6)}
💧 Liq: $${fmtMoney(+c.liqUsd||0)}
🏷️ FDV: $${fmtMoney(+c.fdvUsd||0)}
[DexScreener](https://dexscreener.com/solana/${c.pairAddress}) · [Gecko](https://www.geckoterminal.com/solana/pools/${c.pairAddress})`
        ).join('\n\n');

        const text = `🎯 *Top Candidatos* (auto)\n\n${body}\n\n— Card informativa: el Sniper decide aparte.`;
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', disable_web_page_preview: true });

        bot._lastM4Hash[uid] = hash;
        bot._lastM4Ts[uid]   = now;
      }
    } catch {}
  }, ENV.M4_TICK_MS);
}
