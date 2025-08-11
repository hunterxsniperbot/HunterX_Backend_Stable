// src/commands/autoSniper.js — AutoSniper FULL (strict/turbo + GIVEBACK ladder + SL por IA + ventanas prioritarias)
// - Escanea 24/7. En ventanas 9–12 / 13–16 / 17–20 (UTC−3) baja el intervalo (prioridad).
// - Entradas por perfil (strict/turbo). En strict aplica puertas de seguridad más duras.
// - Stop-Ladder (GIVEBACK): venta 100% cuando cae hasta backToPct tras haber tocado triggerUpPct.
// - Stop Loss duro SOLO si IA marca scam (bot._riskFlags[uid][mint]?.isScam === true).
// - Totalmente separado DEMO vs REAL; las ventas reales llaman a phantomClient, las demo son MOCK.

import trading from '../services/trading.js';

const SCAN_MS_NORMAL   = 15000;  // 15s fuera de ventana
const SCAN_MS_PRIORITY = 5000;   // 5s dentro de ventana
const LOCAL_UTC_OFFSET = -3;     // UTC−03:00 (Argentina)

const PRIORITY_WINDOWS = [
  { start:  9, end: 12 }, // 9–12
  { start: 13, end: 16 }, // 13–16
  { start: 17, end: 20 }, // 17–20
];

// STOP LADDER por defecto (tu pedido)
const DEFAULT_STOP_LADDER = [
  { triggerUpPct: 100,  backToPct:  30,  sellPct: 100 },
  { triggerUpPct: 250,  backToPct: 125,  sellPct: 100 },
  { triggerUpPct: 500,  backToPct: 200,  sellPct: 100 },
  { triggerUpPct: 750,  backToPct: 300,  sellPct: 100 },
  { triggerUpPct: 1000, backToPct: 400,  sellPct: 100 },
  { triggerUpPct: 2000, backToPct: 800,  sellPct: 100 },
];

// Perfil STRICT (más filtros); TURBO más laxo
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
  minBuyRatioPct: 65
};

const TURBO = {
  minLiquidityUsd: 15000,
  minHolders: 50,
  maxTop1Pct: 20,
  maxTop10Pct: 70,
  minVol5m: 8000,
  minTxPerMin: 8,
  minUniqueBuyersMin: 4,
  maxSpreadPct: 1.4,
  maxImpact100Pct: 4.0,
  maxRetracePct: 45,
  minBuyRatioPct: 58
};

function safeNumber(n, def=null){ n = Number(n); return Number.isFinite(n) ? n : def; }

function localHourUtcMinus3(d=new Date()){
  // Ajuste simple: UTC hora + (-3)
  const h = d.getUTCHours() + LOCAL_UTC_OFFSET;
  return (h + 24) % 24;
}

function inPriorityWindow(now=new Date()){
  const h = localHourUtcMinus3(now);
  return PRIORITY_WINDOWS.some(w => h >= w.start && h < w.end);
}

function baseSafety(cand, profile){
  const P = profile === 'strict' ? STRICT : TURBO;
  const L  = safeNumber(cand.metrics?.liquidity_usd);
  const H  = safeNumber(cand.metrics?.holders);
  const S  = safeNumber(cand.metrics?.spread_pct);
  const I100 = safeNumber(cand.metrics?.priceImpact100_pct);
  const T1 = safeNumber(cand.metrics?.top1_pct);
  const T10= safeNumber(cand.metrics?.top10_pct);
  const V5 = safeNumber(cand.metrics?.vol5m_usd);
  const TX = safeNumber(cand.metrics?.tx_per_min);
  const UB = safeNumber(cand.metrics?.unique_buyers_min);
  const LP = safeNumber(cand.metrics?.lp_lock_or_burn_pct);

  if (L != null  && L  < P.minLiquidityUsd) return {ok:false, why:'liquidez baja'};
  if (H != null  && H  < P.minHolders)      return {ok:false, why:'holders bajos'};
  if (T1!= null  && T1 > P.maxTop1Pct)      return {ok:false, why:'top1 concentrado'};
  if (T10!= null && T10> P.maxTop10Pct)     return {ok:false, why:'top10 concentrado'};
  if (S != null  && S  > P.maxSpreadPct)    return {ok:false, why:'spread alto'};
  if (I100!=null && I100> P.maxImpact100Pct)return {ok:false, why:'impacto $100 alto'};
  if (V5!= null  && V5 < P.minVol5m)        return {ok:false, why:'vol 5m bajo'};
  if (TX!= null  && TX < P.minTxPerMin)     return {ok:false, why:'tx/min bajo'};
  if (UB!= null  && UB < P.minUniqueBuyersMin) return {ok:false, why:'buyers/min bajo'};
  if (LP!= null  && LP < 90)                return {ok:false, why:'LP lock/burn <90%'};
  return {ok:true};
}

function momentumGate(intel, profile){
  const P = profile === 'strict' ? STRICT : TURBO;
  const retr = safeNumber(intel?.retracePct);
  const buyR = safeNumber(intel?.buyRatioPct);
  const hhhl = !!intel?.hhhl;
  if (!hhhl) return {ok:false, why:'sin HH/HL'};
  if (retr!=null && retr > P.maxRetracePct) return {ok:false, why:'retroceso alto'};
  if (buyR!=null && buyR < P.minBuyRatioPct) return {ok:false, why:'buy ratio bajo'};
  return {ok:true};
}

function decideEntry({cand, intel, ageSec, baseSizeUsd, profile}){
  const s = baseSafety(cand, profile);
  if (!s.ok) return { action:'block', reason:s.why };

  const slipBase = profile === 'strict' ? 0.8 : 1.0; // %
  if (ageSec != null && ageSec < 60) {
    const m = momentumGate(intel, profile);
    if (!m.ok) return { action:'block', reason:`early ${m.why}` };
    return { action:'probe', sizePct: 0.2, slippagePct: Math.min(1.2, slipBase+0.4) };
  }
  const m = momentumGate(intel, profile);
  if (m.ok) return { action:'full', sizePct: 1.0, slippagePct: slipBase };
  return { action:'probe', sizePct: 0.3, slippagePct: slipBase };
}

export default function registerAutoSniper(bot, { quickNodeClient, phantomClient }) {
  // stores separados
  bot._asPositionsDemo = bot._asPositionsDemo || {};
  bot._asPositionsReal = bot._asPositionsReal || {};
  bot._asLoops         = bot._asLoops         || {};
  bot._riskFlags       = bot._riskFlags       || {}; // IA puede marcar scam: bot._riskFlags[uid][mint] = { isScam:true }

  // settings por usuario (si no está /ajustes, uso .env)
  bot.getUserSettings = bot.getUserSettings || ((uid) => ({
    profile: (process.env.PROFILE || 'strict').toLowerCase(),
    baseDemo: Number(process.env.SNIPER_BASE_DEMO_USD || 100),
    baseReal: Number(process.env.SNIPER_BASE_REAL_USD || 100),
  }));

  // escalera por usuario (si no hay, default)
  bot._stopLadder = bot._stopLadder || {};

  bot.onText(/^\/autosniper$/, async (msg) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);

    if (bot._asLoops[uid]) {
      clearInterval(bot._asLoops[uid]);
      delete bot._asLoops[uid];
      return bot.sendMessage(chatId, '🟥 *AutoSniper detenido*', { parse_mode:'Markdown' });
    }

    // iniciar
    bot._asPositionsDemo[uid] = bot._asPositionsDemo[uid] || []; // [{mint, symbol, qty, avg, highest, tps:{}, ...}]
    bot._asPositionsReal[uid] = bot._asPositionsReal[uid] || [];

    const loop = async () => {
      try {
        const settings = bot.getUserSettings(uid);
        const profile = (settings.profile === 'turbo') ? 'turbo' : 'strict';
        const baseDemo = Math.max(1, Number(settings.baseDemo || 100));
        const baseReal = Math.max(1, Number(settings.baseReal || 100));
        const ladder   = bot._stopLadder[uid] || DEFAULT_STOP_LADDER;

        // prioridad de ventana
        const scanMs = inPriorityWindow() ? SCAN_MS_PRIORITY : SCAN_MS_NORMAL;

        // 1) escanear nuevos candidatos
        const found = await (quickNodeClient.scanNewTokens?.() || []);
        for (const cand of found) {
          // intel opcional
          const intel = {
            hhhl: !!cand.intel?.hhhl,
            retracePct: safeNumber(cand.intel?.retracePct),
            buyRatioPct: safeNumber(cand.intel?.buyRatioPct)
          };
          const ageSec = safeNumber(cand.metrics?.age_sec);
          const d = decideEntry({ cand, intel, ageSec, baseSizeUsd: baseDemo, profile }); // decidimos con base demo (sólo sizing)
          if (d.action === 'block') continue;

          // DEMO compra
          await doBuy({
            mode: 'DEMO', uid, bot, phantomClient,
            mint: cand.mint, symbol: cand.symbol || (cand.mint ? cand.mint.slice(0,6)+'…' : '—'),
            amountUsd: Math.round(baseDemo * d.sizePct),
            slippagePct: d.slippagePct
          });

          // Si querés activar REAL con mismo cand (cuando tengas saldo), podés clonar con baseReal:
          // await doBuy({ mode: 'REAL', uid, bot, phantomClient, mint: cand.mint, symbol: cand.symbol, amountUsd: Math.round(baseReal * d.sizePct), slippagePct: d.slippagePct });
        }

        // 2) gestionar salidas (DEMO y REAL)
        await manageAllExits({ bot, uid, mode: 'DEMO', store: bot._asPositionsDemo[uid], phantomClient, ladder });
        await manageAllExits({ bot, uid, mode: 'REAL', store: bot._asPositionsReal[uid], phantomClient, ladder });

        // reprogramar loop con el intervalo dinámico
        bot._asLoops[uid] = setTimeout(loop, scanMs);
      } catch (e) {
        // en caso de error, reintentar en normal
        bot._asLoops[uid] = setTimeout(loop, SCAN_MS_NORMAL);
      }
    };

    bot._asLoops[uid] = setTimeout(loop, 100); // arranque rápido
    bot.sendMessage(chatId, `🟩 *AutoSniper ACTIVADO*\nVentanas prioritarias: 9–12 / 13–16 / 17–20 UTC−3\nPerfil: *${(bot.getUserSettings(uid).profile||'strict').toUpperCase()}*`, { parse_mode:'Markdown' });
  });
}

// ——— helpers de buy/sell/qty ———

async function doBuy({ mode, uid, bot, phantomClient, mint, symbol, amountUsd, slippagePct }) {
  const store = mode === 'REAL' ? (bot._asPositionsReal[uid] ||= []) : (bot._asPositionsDemo[uid] ||= []);
  const price = await safeGetPrice(bot, mint, symbol);
  if (!price) return;

  const qty = amountUsd / price;
  const tx = mode === 'REAL'
    ? await phantomClient.buyToken({ mint, amountUsd, slippagePct }).catch(()=>({ ok:false }))
    : { ok:true, txid:'MOCK_BUY_'+Date.now() };

  if (!tx?.ok) return;

  const pos = store.find(x => x.mint === mint);
  if (!pos) {
    store.push({ mint, symbol, qty, avg: price, highest: price, tps: {} });
  } else {
    const newQty = pos.qty + qty;
    pos.avg = (pos.avg*pos.qty + price*qty) / newQty;
    pos.qty = newQty;
    pos.highest = Math.max(pos.highest, price);
  }

  await trading.logTrade({
    mode, type:'buy', token:symbol, mint,
    inversion_usd: amountUsd, entrada_usd: price, slippage_pct: slippagePct,
    fuente: 'AutoSniper'
  });
}

function dropQty(store, mint, qty){
  const i = store.findIndex(x => x.mint === mint);
  if (i < 0) return;
  const p = store[i];
  p.qty = Math.max(0, p.qty - qty);
  if (p.qty === 0) store.splice(i,1);
}

async function execSell({ mode, phantomClient, mint, amountToken, slippagePct }){
  if (mode === 'REAL') {
    try {
      const r = await phantomClient.sellToken({ mint, amountToken, slippagePct });
      return { ok:true, txid: r?.txid || 'REAL_SELL_'+Date.now() };
    } catch { return { ok:false }; }
  } else {
    return { ok:true, txid: 'MOCK_SELL_'+Date.now() };
  }
}

async function safeGetPrice(bot, mint, symbol){
  try {
    return await bot.quickNodeClient?.getPrice?.(mint || symbol).catch(()=>null);
  } catch { return null; }
}

// ——— gestión de salidas sobre todas las posiciones ———

async function manageAllExits({ bot, uid, mode, store, phantomClient, ladder }){
  if (!Array.isArray(store) || store.length === 0) return;
  for (const p of [...store]) { // copiar por si mutamos
    const cur = await safeGetPrice(bot, p.mint, p.symbol);
    if (!cur) continue;
    p.highest = Math.max(p.highest || cur, cur);
    await manageExits({ bot, uid, mode, store, p, cur, phantomClient, ladder });
  }
}

// ——— AQUI VA EL BLOQUE CON SL IA + GIVEBACK LADDER ———

async function manageExits({ bot, uid, mode, store, p, cur, phantomClient, ladder }){
  // 1) Stop Loss SOLO si IA marca scam
  const risk = (bot._riskFlags?.[uid]?.[p.mint]) || null;
  if (risk?.isScam) {
    const pnlPct = p.avg > 0 ? ((cur - p.avg) / p.avg) * 100 : 0;
    const SL_HARD = Number(process.env.SL_IA_SCAM_PCT || -12); // por ej. -12%
    if (pnlPct <= SL_HARD) {
      const sold = await execSell({ mode, phantomClient, mint: p.mint, amountToken: p.qty, slippagePct: 1.2 });
      if (sold.ok) {
        await trading.logTrade({
          mode, type:'sell', token:p.symbol, mint:p.mint,
          salida_usd: cur, inversion_usd: p.avg*p.qty,
          pnl_usd: (cur - p.avg)*p.qty, pnl_pct: pnlPct,
          fuente:'AutoSniper', extra:{ reason:'SL_IA_SCAM', txid: sold.txid }
        });
        dropQty(store, p.mint, p.qty);
        return;
      }
    }
  }

  // 2) GIVEBACK LADDER (venta 100% cuando cae a backTo tras alcanzar trigger)
  {
    const rules = (ladder && ladder.length) ? ladder : DEFAULT_STOP_LADDER;
    if (!p._gbApplied) p._gbApplied = {};

    const pnlPct = p.avg > 0 ? ((cur - p.avg) / p.avg) * 100 : 0;
    const peakPct = p.highest > 0 ? ((p.highest - p.avg) / p.avg) * 100 : 0;

    for (const r of rules) {
      const key = `${r.triggerUpPct}_${r.backToPct}_${r.sellPct}`;
      if (p._gbApplied[key]) continue;
      if (peakPct >= r.triggerUpPct && pnlPct <= r.backToPct) {
        const sellQty = p.qty * (r.sellPct / 100);
        if (sellQty > 0) {
          const sold = await execSell({ mode, phantomClient, mint: p.mint, amountToken: sellQty, slippagePct: 0.8 });
          if (sold.ok) {
            dropQty(store, p.mint, sellQty);
            p._gbApplied[key] = true;
            await trading.logTrade({
              mode, type:'sell', token:p.symbol, mint:p.mint,
              salida_usd: cur, inversion_usd: p.avg*sellQty,
              pnl_usd: (cur - p.avg)*sellQty, pnl_pct: pnlPct,
              fuente:'AutoSniper', extra:{ reason:`GIVEBACK ${r.triggerUpPct}->${r.backToPct} sell ${r.sellPct}%`, txid: sold.txid }
            });
          }
        }
      }
    }
  }

  // 3) (Opcional) TP parciales/trailing — desactivados por defecto para no cruzarse con la escalera.
  // Si querés reactivarlos, agregalos aquí después del GIVEBACK.
}
