/**
 * tickM4.js — emite una card "Señal PREVIA" con los Top candidatos Gecko
 * - Bajo ruido: 1 card cada TTL por usuario si cambian los items.
 * - Privado: se envía al chatId == uid (DM).
 * - No ejecuta compras; sólo informa. La ejecución la haremos en M5/M6.
 */
import { discoverTop } from './candidatesGecko.js';

function fmtUSD(n) {
  if (n == null || isNaN(n)) return 'N/A';
  const v = Number(n);
  if (v >= 1e6) return '$' + (v/1e6).toFixed(1) + 'M';
  if (v >= 1e3) return '$' + (v/1e3).toFixed(1) + 'k';
  return '$' + v.toFixed(6).replace(/0+$/,'').replace(/\.$/,'');
}

function dexsUrl(pair){ return `https://dexscreener.com/solana/${pair}`; }
function gkUrl(pair){ return `https://www.geckoterminal.com/solana/pools/${pair}`; }

export async function tickM4(bot, uid) {
  // si alguien apagó el sniper mientras corría
  if (!bot._sniperOn || !bot._sniperOn[uid]) return;
  const every = Number(process.env.M4_TICK_MS || 15000);
  bot._m4NextAt = bot._m4NextAt || {};
  if ((bot._m4NextAt[uid]||0) > Date.now()) return;
  bot._m4NextAt[uid] = Date.now() + every;

  // límites/params desde .env
  const topN = Number(process.env.CAND_TOP || 3);
  const ttl  = (Number(process.env.M4_BROADCAST_TTL_S || 600)) * 1000;

  // pedir candidatos (ya filtra con CAND_MIN_LIQ_USD / CAND_MAX_FDV_USD)
  let items = [];
  try {
    items = await discoverTop();
  } catch(_e) {
    return; // silencioso (bajo ruido)
  }
  if (!items?.length) return;

  // quedate con topN
  items = items.slice(0, topN);

  // anti-ruido: sólo si cambió la "firma" vs. último aviso y pasó TTL
  bot._m4Seen = bot._m4Seen || {};
  const now = Date.now();
  const prev = bot._m4Seen[uid] || { sig:'', ts:0 };
  const sig = items.map(i => i.pairAddress).join(',');

  if (prev.sig === sig && (now - prev.ts) < ttl) return; // mismo set reciente → silencio
  bot._m4Seen[uid] = { sig, ts: now };

  // Render card compacta
  const lines = [];
  lines.push(`👀 <b>Señal PREVIA</b> — candidatos M4`);
  items.forEach((c, i) => {
    const price = (c.priceUsd!=null) ? ('$' + Number(c.priceUsd).toFixed(6).replace(/0+$/,'').replace(/\.$/,''))
                                     : 'N/A';
    const liq   = fmtUSD(c.liqUsd ?? c.liquidityUsd);
    const fdv   = fmtUSD(c.fdvUsd);

    lines.push(
      `${i+1}. <b>$${(c.sym||c.baseSymbol||'?')}</b> <i>(${c.source||'gecko'})</i>\n` +
      `   💵 Precio: <b>${price}</b>  ` +
      `💧 Liq: <b>${liq}</b>  ` +
      `🏷️ FDV: <b>${fdv}</b>\n` +
      `   <a href="${dexsUrl(c.pairAddress)}">DexScreener</a> · <a href="${gkUrl(c.pairAddress)}">Gecko</a>`
    );
  });
  lines.push(`— Card informativa: el Sniper decide aparte.`);
  const text = lines.join('\n');

  // enviar al chat privado (en tu caso, uid == chatId)
  try {
    await bot.sendMessage(Number(uid), text, { parse_mode: 'HTML', disable_web_page_preview: true });
  } catch(_e) {/* silencio */}
}
