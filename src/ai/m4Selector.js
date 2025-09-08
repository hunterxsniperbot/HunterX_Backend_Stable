/* HX — M4 selector con cooldown por usuario y TTL por símbolo (DEMO) */
import * as markets from "../services/marketsPref.js";

// Defaults (override con .env)
const M4_COOLDOWN_S  = Number(process.env.M4_COOLDOWN_S  || 45);    // 45s entre compras por usuario
const M4_REBUY_TTL_S = Number(process.env.M4_REBUY_TTL_S || 600);   // 10m sin recomprar mismo símbolo

const MIN_LIQ = Number(process.env.M4_MIN_LIQ_USD || 150000);
const MAX_FDV = Number(process.env.M4_MAX_FDV_USD || 300000);
const SIZE    = Number(process.env.SNIPER_BASE_DEMO_USD || 20);

export async function pickCandidate(bot, uid) {
  const limit = Number(process.env.M4_SCAN_LIMIT || 40);
  const pairs = await markets.getSolanaPairs({ limit });

  // Filtro simple; si ninguno calza, devolvemos el primero para no romper
  const cand = pairs.find(p =>
    (Number(p.liquidityUsd || 0) >= MIN_LIQ) &&
    (Number(p.fdvUsd || 0) > 0) &&
    (Number(p.fdvUsd) <= MAX_FDV)
  );

  return cand || pairs[0] || null;
}

export async function maybeAutoBuyDemo(bot, uid, { demoBuyOnce }) {
  const now = Math.floor(Date.now() / 1000);

  // ----- Cooldown por usuario -----
  bot._m4Cooldown ??= {};
  const last = bot._m4Cooldown[uid] || 0;
  if (now - last < M4_COOLDOWN_S) {
    return { ok:false, reason:'cooldown', wait_s: M4_COOLDOWN_S - (now - last) };
  }

  // ----- Candidato -----
  const cand = await pickCandidate(bot, uid);
  if (!cand) return { ok:false, reason:'no_candidate' };

  const sym = String(cand.baseSymbol || cand.symbol || '?').trim();
  const liq = Number(cand.liquidityUsd || 0);
  const fdv = Number(cand.fdvUsd || 0);

  // ----- Rebuy-TTL por símbolo -----
  bot._m4Bought ??= {};
  bot._m4Bought[uid] ??= {}; // SYMBOL -> ts
  const key = sym.toUpperCase();
  const lastBuySym = bot._m4Bought[uid][key] || 0;
  if (now - lastBuySym < M4_REBUY_TTL_S) {
    return { ok:false, reason:'already_bought_recently', symbol:sym, next_s: M4_REBUY_TTL_S - (now - lastBuySym) };
  }

  // ----- Umbral final -----
  if (liq < MIN_LIQ || (fdv > 0 && fdv > MAX_FDV)) {
    return { ok:false, reason:'threshold_reject', symbol:sym, liq, fdv };
  }

  // ----- Ejecutar compra DEMO -----
  if (typeof demoBuyOnce !== 'function') {
    return { ok:false, reason:'no_demo_buy_func' };
  }

  try {
    const trade = await demoBuyOnce(SIZE, sym); // tu helper DEMO
    // marca cooldown y TTL del símbolo
    bot._m4Cooldown[uid]   = now;
    bot._m4Bought[uid][key] = now;

    return { ok:true, trade, symbol:sym, size:SIZE, liq, fdv };
  } catch (e) {
    return { ok:false, reason:'demo_buy_fail', error:String(e?.message||e) };
  }
}
