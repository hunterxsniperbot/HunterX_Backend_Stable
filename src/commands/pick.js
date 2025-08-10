// src/commands/pick.js — /pick <mint> [montoUSD] (Sheets A–Z + Supabase)
// - Enriquecimiento intel, Guard (hard/soft), Slippage dinámico
// - Log en Sheets (A→Z) en pestaña DEMO/REAL y upsert en Supabase

import { enrichMint, getSolUsd } from '../services/intel.js';
import { canBuyToken } from '../services/guard.js';
import { computeDynamicSlippageBps } from '../services/slippage.js';

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TZ = 'America/Argentina/Buenos_Aires';
const RE_BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

// Headers A..Z (para asegurar si hace falta)
const HEADERS_AZ = [
  'timestamp_iso','datetime_local','user_id','mode','type','token','mint',
  'amount_usd','qty_tokens','entry_price_usd','exit_price_usd','slippage_pct',
  'tx','src','age_min','liq_sol','fdv_usd','holders','vol_usd_min',
  'guard_mode','guard_flags','whale_signal','discord_signal','intel_score',
  'pnl_usd','pnl_pct'
];

// ——— compat append (objeto.appendRow o función directa) ———
function getAppendCompat(sheetsClient) {
  if (!sheetsClient) return null;
  if (typeof sheetsClient.appendRow === 'function') {
    return async (row, opts={}) => {
      try { await sheetsClient.appendRow(row, opts); }
      catch { await sheetsClient.appendRow(row); }
    };
  }
  if (typeof sheetsClient === 'function') {
    return async (row, opts={}) => {
      try { await sheetsClient(row, opts); }
      catch { await sheetsClient(row); }
    };
  }
  return null;
}
function nowRowPrefix(uid, mode) {
  const d = new Date();
  return [
    d.toISOString(),                               // A timestamp_iso
    d.toLocaleString('es-AR', { timeZone: TZ }),   // B datetime_local
    String(uid),                                   // C user_id
    mode                                           // D mode
  ];
}

export default function registerPick(bot, { quickNodeClient, phantomClient, sheetsClient, supabaseClient }) {
  const appendCompat = getAppendCompat(sheetsClient);

  // /pick <mint> [montoUSD]
  bot.onText(/^\/pick(?:@[\w_]+)?\s+([A-Za-z0-9]{32,44})(?:\s+(\d+(?:\.\d+)?))?$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);

    const mint = (match?.[1] || '').trim();
    const amountArg = match?.[2] ? Number(match[2]) : null;

    if (!RE_BASE58.test(mint)) {
      return bot.sendMessage(chatId, '⚠️ Mint inválido. Uso: /pick <mint> [montoUSD]');
    }

    // Modo actual
    const isDemo = bot.demoMode?.[uid] || (!bot.demoMode?.[uid] && !bot.realMode?.[uid]);
    const mode   = isDemo ? 'DEMO' : 'REAL';

    // Monto robusto
    const cfgAmount = bot.sniperConfig?.[uid]?.monto;
    const envAmount = parseFloat(process.env.FIXED_TRADE_AMOUNT);
    let amountUsd = (Number.isFinite(amountArg) && amountArg > 0)
      ? amountArg
      : (Number.isFinite(cfgAmount) && cfgAmount > 0)
      ? cfgAmount
      : (Number.isFinite(envAmount) && envAmount > 0)
      ? envAmount
      : 25;

    // Enriquecer candidato
    const cand = { mint, symbol: mint.slice(0,6)+'…', metrics: {} };
    const intel = await enrichMint(mint).catch(()=>null);
    if (intel) {
      cand.symbol = intel.symbol || cand.symbol;
      cand.priceUsd = intel.priceUsd ?? null;
      cand.metrics.holders   = intel.holders ?? null;
      cand.metrics.liquidity = intel.liqSol ?? null;   // SOL
      cand.metrics.fdv       = intel.fdv ?? null;
      cand.metrics.volume    = intel.volume1mUsd ?? null;
      cand.url = intel.url || null;
      cand.__intel = intel;
    }

    // Guard (hard/soft/off)
    const enabled   = (bot._guardEnabled?.[uid] !== undefined) ? !!bot._guardEnabled[uid] : true;
    const modeGuard = bot._guardMode?.[uid] || 'hard';
    if (enabled) {
      const verdict = await canBuyToken(cand).catch(()=>({ ok:true, reasons:[] }));
      if (!verdict.ok) {
        const warn = `🛡️ Guard (${modeGuard}) — Riesgos: ${verdict.reasons.join(', ')}`;
        if (modeGuard === 'hard') {
          return bot.sendMessage(chatId, `⛔ ${warn}\n🪙 ${cand.symbol}`);
        } else {
          await bot.sendMessage(chatId, `⚠️ ${warn}\n🪙 ${cand.symbol}\n(se deja pasar por modo *soft*)`, { parse_mode: 'Markdown' });
        }
      }
    }

    // Slippage dinámico
    const solUsd = intel?.solUsd || await getSolUsd().catch(()=>null);
    const bps    = await computeDynamicSlippageBps(bot, cand, { amountUsd, solUsd }).catch(()=>150);
    const slippagePct = Number((bps / 100).toFixed(2));

    // Ejecutar compra
    let txHash;
    try {
      if (isDemo) {
        txHash = 'MOCK_BUY_' + Date.now();
        console.log(`(DEMO /pick) $${amountUsd} mint ${mint} slippage=${slippagePct}%`);
      } else {
        txHash = await phantomClient.buyToken({
          mintAddress: mint,
          amountUsd,
          slippage: slippagePct,
          inputMint: SOL_MINT
        });
      }
    } catch (e) {
      console.error('[pick] buy error:', e?.message || e);
      return bot.sendMessage(chatId, `❌ Error en compra: ${e?.message || e}`);
    }

    // Registrar posición en memoria (para Stop-Profit)
    bot._positions ||= {};
    bot._positions[uid] = bot._positions[uid] || [];
    const entry = Number(cand.priceUsd ?? 0);
    const pos = {
      txSignature: txHash,
      mintAddress: mint,
      tokenSymbol: cand.symbol,
      entryPrice:  entry,
      amountToken: entry ? (amountUsd / entry) : 0,
      soldTargets: [],
      __intel: cand.__intel || null
    };
    bot._positions[uid].push(pos);

    // Sheets: BUY (A→Z)
    try {
      if (appendCompat) {
        const sheetName = mode; // "DEMO" o "REAL"
        const row = [
          ...nowRowPrefix(uid, mode),                 // A..D
          'BUY',                                      // E type
          cand.symbol || '',                          // F token
          mint,                                       // G mint
          Number(amountUsd) || '',                    // H amount_usd
          Number(pos.amountToken) || '',              // I qty_tokens
          Number(entry) || '',                        // J entry_price_usd
          '',                                         // K exit_price_usd
          Number(slippagePct) || '',                  // L slippage_pct
          txHash,                                     // M tx
          'MARKET',                                   // N src
          '',                                         // O age_min (no del escáner en /pick)
          Number(cand.metrics?.liquidity) || '',      // P liq_sol
          Number(cand.metrics?.fdv) || '',            // Q fdv_usd
          Number(cand.metrics?.holders) || '',        // R holders
          Number(cand.metrics?.volume) || '',         // S vol_usd_min
          (bot._guardMode?.[uid] || 'hard'),          // T guard_mode
          (cand.__intel?.risk?.flags || []).join('|') || '', // U guard_flags
          Number(cand.__intel?.whaleScore ?? 0) || 0,        // V whale_signal
          Number(cand.__intel?.discordScore ?? 0) || 0,      // W discord_signal
          Number(cand.__intel?.intelScore ?? 0) || 0,        // X intel_score
          '',                                         // Y pnl_usd
          ''                                          // Z pnl_pct
        ];
        await appendCompat(row, { sheetName, ensureHeader: true, headers: HEADERS_AZ });
      }
    } catch (e) {
      console.error('[Sheets] appendRow compra(/pick) error:', e?.message || e);
    }

    // Supabase: BUY
    try {
      await supabaseClient.upsertTrade({
        fecha_hora: new Date().toISOString(),
        mode,
        token: cand.symbol || '',
        mint,
        entrada_usd: Number(entry) || null,
        salida_usd: null,
        inversion_usd: Number(amountUsd) || null,
        pnl_usd: null,
        pnl_pct: null,
        slippage_pct: Number(slippagePct) || null,
        volumen_24h_usd: Number(cand.metrics?.volume) || null,
        liquidez_usd: Number(cand.metrics?.liquidity) || null,
        holders: Number(cand.metrics?.holders) || null,
        fdv_usd: Number(cand.metrics?.fdv) || null,
        marketcap_usd: null,
        red: 'Solana',
        fuente: 'MARKET',
        url: cand.url || null,
        tx: txHash,
        extra: cand.__intel ? JSON.stringify(cand.__intel) : null
      });
    } catch (e) {
      console.error('[Supabase] BUY(/pick) error:', e?.message || e);
    }

    // Notificación
    await bot.sendMessage(
      chatId,
      `🎯 *PICK ${mode}*\n` +
      `🪙 ${cand.symbol}\n` +
      `💵 Monto: $${amountUsd.toFixed(2)}\n` +
      `📥 Entrada: ${entry || '–'}\n` +
      `💸 Slippage: ${slippagePct}%\n` +
      (cand.url ? `🔗 ${cand.url}\n` : '') +
      `🔐 TX: \`${txHash}\``,
      { parse_mode: 'Markdown' }
    );
  });

  // Ayuda mínima si escriben sin args
  bot.onText(/^\/pick(?:@[\w_]+)?$/i, (msg) => {
    bot.sendMessage(msg.chat.id, 'Uso: /pick <mint> [montoUSD]\nEj: /pick So11111111111111111111111111111111111111112 50');
  });
}
