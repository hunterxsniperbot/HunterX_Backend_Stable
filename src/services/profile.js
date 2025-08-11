// src/services/profile.js — perfiles STRICT/TURBO + montos DEMO/REAL por usuario + decisión de entrada

function n(v, d = null) { v = Number(String(v).replace(',', '.')); return Number.isFinite(v) ? v : d; }
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

const AMOUNT_MIN = 5;
const AMOUNT_MAX = 10000;

function getDefaultProfileName() {
  const p = String(process.env.PROFILE || 'strict').toLowerCase();
  return p === 'turbo' ? 'turbo' : 'strict';
}
function getDefaultBaseDemoUsd() {
  return clamp(n(process.env.SNIPER_BASE_DEMO_USD, 100) || 100, AMOUNT_MIN, AMOUNT_MAX);
}
function getDefaultBaseRealUsd() {
  return clamp(n(process.env.SNIPER_BASE_REAL_USD, 100) || 100, AMOUNT_MIN, AMOUNT_MAX);
}

// ——— Storage en memoria por usuario ———
function ensureUserObj(bot, uid) {
  uid = String(uid);
  bot.userProfile = bot.userProfile || {};
  if (typeof bot.userProfile[uid] === 'string') {
    // compatibilidad hacia atrás (antes guardábamos sólo el nombre)
    bot.userProfile[uid] = { profile: bot.userProfile[uid] };
  }
  if (!bot.userProfile[uid]) bot.userProfile[uid] = {};
  return bot.userProfile[uid];
}

export function getUserProfileName(bot, uid) {
  const u = ensureUserObj(bot, uid);
  return u.profile || getDefaultProfileName();
}
export function setUserProfileName(bot, uid, name) {
  const u = ensureUserObj(bot, uid);
  const val = String(name || '').toLowerCase() === 'turbo' ? 'turbo' : 'strict';
  u.profile = val;
  return val;
}

export function getUserBaseUsd(bot, uid, mode /* 'DEMO'|'REAL' */) {
  const u = ensureUserObj(bot, uid);
  if (String(mode).toUpperCase() === 'REAL') {
    return n(u.baseRealUsd, getDefaultBaseRealUsd());
  }
  return n(u.baseDemoUsd, getDefaultBaseDemoUsd());
}
export function setUserBaseUsd(bot, uid, mode, amount) {
  const u = ensureUserObj(bot, uid);
  const val = clamp(n(amount), AMOUNT_MIN, AMOUNT_MAX);
  if (String(mode).toUpperCase() === 'REAL') u.baseRealUsd = val;
  else u.baseDemoUsd = val;
  return val;
}

export function getUserSettingsSummary(bot, uid) {
  const profile = getUserProfileName(bot, uid);
  const demo = getUserBaseUsd(bot, uid, 'DEMO');
  const real = getUserBaseUsd(bot, uid, 'REAL');
  return { profile, demo, real };
}

// ——— Configs de perfiles ———
const STRICT = {
  minLiquidityUsd: 40000,
  minHolders: 200,
  maxTop1Pct: 10,
  maxTop10Pct: 55,
  minVol5m: 25000,
  minTxPerMin: 25,
  minUniqueBuyersMin: 12,
  maxSpreadPct: 0.8,
  maxImpact100Pct: 2.0,
  maxRetracePct: 35,
  minBuyRatioPct: 65,
  probeSizePctYoung: 0.20,
  probeSizePctOld:   0.30,
  fullSizePct:       1.00,
  slipBase:          0.8,
  slipProbeYoung:    1.2
};

const TURBO = {
  minLiquidityUsd: 20000,
  minHolders: 80,
  maxTop1Pct: 15,
  maxTop10Pct: 65,
  minVol5m: 8000,
  minTxPerMin: 10,
  minUniqueBuyersMin: 6,
  maxSpreadPct: 1.5,
  maxImpact100Pct: 3.0,
  maxRetracePct: 45,
  minBuyRatioPct: 55,
  probeSizePctYoung: 0.30,
  probeSizePctOld:   0.50,
  fullSizePct:       1.00,
  slipBase:          1.2,
  slipProbeYoung:    1.5
};

function baseSafety(cand, cfg) {
  const L  = n(cand.metrics?.liquidity_usd);
  const H  = n(cand.metrics?.holders);
  const S  = n(cand.metrics?.spread_pct);
  const I100 = n(cand.metrics?.priceImpact100_pct);
  const T1 = n(cand.metrics?.top1_pct);
  const T10= n(cand.metrics?.top10_pct);
  const V5 = n(cand.metrics?.vol5m_usd);
  const TX = n(cand.metrics?.tx_per_min);
  const UB = n(cand.metrics?.unique_buyers_min);
  const LP = n(cand.metrics?.lp_lock_or_burn_pct);
  if (L != null  && L  < cfg.minLiquidityUsd) return { ok:false, why:'liquidez baja' };
  if (H != null  && H  < cfg.minHolders)      return { ok:false, why:'holders bajos' };
  if (T1!= null  && T1 > cfg.maxTop1Pct)      return { ok:false, why:'top1 concentrado' };
  if (T10!=null  && T10> cfg.maxTop10Pct)     return { ok:false, why:'top10 concentrado' };
  if (S != null  && S  > cfg.maxSpreadPct)    return { ok:false, why:'spread alto' };
  if (I100!=null && I100>cfg.maxImpact100Pct) return { ok:false, why:'impacto $100 alto' };
  if (V5!= null  && V5 < cfg.minVol5m)        return { ok:false, why:'vol 5m bajo' };
  if (TX!= null  && TX < cfg.minTxPerMin)     return { ok:false, why:'tx/min bajo' };
  if (UB!= null  && UB < cfg.minUniqueBuyersMin) return { ok:false, why:'buyers/min bajo' };
  if (LP!= null  && LP < 90)                  return { ok:false, why:'LP lock/burn <90%' };
  return { ok:true };
}

function momentumGate(intel, cfg) {
  const retr = n(intel?.retracePct);
  const buyR = n(intel?.buyRatioPct);
  const hhhl = !!intel?.hhhl;
  if (!hhhl) return { ok:false, why:'sin HH/HL' };
  if (retr!=null && retr > cfg.maxRetracePct) return { ok:false, why:`retroceso >${cfg.maxRetracePct}%` };
  if (buyR!=null && buyR < cfg.minBuyRatioPct) return { ok:false, why:`buy ratio <${cfg.minBuyRatioPct}%` };
  return { ok:true };
}

// Decide block / probe / full
export function decideEntry({ profileName, cand, intel, ageSec }) {
  const cfg = (profileName === 'turbo') ? TURBO : STRICT;
  const safe = baseSafety(cand, cfg);
  if (!safe.ok) return { action:'block', reason:safe.why };

  const young = (ageSec != null && ageSec < 60);
  const m = momentumGate(intel, cfg);

  if (young) {
    if (!m.ok) return { action:'block', reason:`early ${m.why}` };
    return { action:'probe', sizePct: cfg.probeSizePctYoung, slippagePct: cfg.slipProbeYoung };
  }
  if (m.ok)  return { action:'full',  sizePct: cfg.fullSizePct,   slippagePct: cfg.slipBase };
  return      { action:'probe', sizePct: cfg.probeSizePctOld, slippagePct: cfg.slipBase };
}

export default {
  getDefaultProfileName,
  getUserProfileName,
  setUserProfileName,
  getUserBaseUsd,
  setUserBaseUsd,
  getUserSettingsSummary,
  decideEntry
};
