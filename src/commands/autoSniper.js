// src/commands/autoSniper.js — HunterX AutoSniper (Sheets A–Z + Supabase)
// - /autosniper, /stop, /debug
// - Enriquecimiento intel, Guard (hard/soft), Anti-FOMO (45s), Slippage dinámico
// - Logs de BUY y SELL con 26 columnas A..Z (Sheets) + upsert Supabase (public.trades)

import { enrichMint, getSolUsd } from '../services/intel.js';
import { canBuyToken } from '../services/guard.js';
import { computeDynamicSlippageBps } from '../services/slippage.js';

const MIN_AGE_SECONDS = 45;   // Anti-FOMO (no entrar antes de 45s del par)
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Reglas Stop-Profit (gain = priceNow/entry)
const stopProfitRules = [
  { target: 1.00, sellFrac: 0.30 },
  { target: 2.50, sellFrac: 0.25 },
  { target: 5.00, sellFrac: 0.20 },
  { target: 7.50, sellFrac: 0.30 },
  { target:10.00, sellFrac: 0.40 },
  { target:20.00, sellFrac: 0.80 },
];

// ——— Encabezados A..Z (Sheets) ———
const HEADERS_AZ = [
  'timestamp_iso','datetime_local','user_id','mode','type','token','mint',
  'amount_usd','qty_tokens','entry_price_usd','exit_price_usd','slippage_pct',
  'tx','src','age_min','liq_sol','fdv_usd','holders','vol_usd_min',
  'guard_mode','guard_flags','whale_signal','discord_signal','intel_score',
  'pnl_usd','pnl_pct'
];

const TZ = 'America/Argentina/Buenos_Aires';

// ——— Helpers Sheets ———
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

async function ensureHeadersIfPossible(sheetsClient) {
  const append = getAppendCompat(sheetsClient);
  if (!append) return;
  try {
    await append(HEADERS_AZ, { sheetName: 'DEMO', ensureHeader: true, headers: HEADERS_AZ });
    await append(HEADERS_AZ, { sheetName: 'REAL', ensureHeader: true, headers: HEADERS_AZ });
  } catch {
    try { await append(HEADERS_AZ, { ensureHeader: true, headers: HEADERS_AZ }); } catch {}
  }
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

// ——————————————————————————————————————————————————————

export default function registerAutoSniper(bot, {
  quickNodeClient,
  phantomClient,
  sheetsClient,
  supabaseClient
}) {

  // /autosniper — arranca loop
  bot.onText(/\/autosniper/, async (msg) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);

    // limpiar interval previo
    if (bot._intervals?.[uid]) {
      clearInterval(bot._intervals[uid]);
      delete bot._intervals[uid];
    }

    // config monto
    const cfgAmount = bot.sniperConfig?.[uid]?.monto;
    const envAmount = parseFloat(process.env.FIXED_TRADE_AMOUNT);
    const defaultAmount = 25;
    const montoCfg = (Number.isFinite(cfgAmount) && cfgAmount > 0)
      ? cfgAmount
      : (Number.isFinite(envAmount) && envAmount > 0)
      ? envAmount
      : defaultAmount;

    const scanMs    = bot.sniperConfig?.[uid]?.scanInterval ?? 15_000;
    const modeStr   = bot.realMode?.[uid] ? 'REAL' : (bot.demoMode?.[uid] ? 'DEMO' : 'DEMO');
    const guardMode = bot._guardMode?.[uid] || 'hard';
    const guardOn   = (bot._guardEnabled?.[uid] !== undefined) ? !!bot._guardEnabled[uid] : true;

    // asegurar headers
    await ensureHeadersIfPossible(sheetsClient).catch(()=>{});

    await bot.sendMessage(
      chatId,
      `🤖 *SNIPER AUTOMÁTICO ACTIVADO*\n\n` +
      `⏱️ Scan: ${(scanMs/1000)|0}s\n` +
      `💰 Monto por operación: $${Number(montoCfg).toFixed(2)}\n` +
      `🛡️ Guard: ${guardOn ? (guardMode === 'hard' ? 'HARD (bloquea)' : 'SOFT (avisa)') : 'OFF'}\n` +
      `🔐 Modo: ${modeStr}`,
      { parse_mode: 'Markdown' }
    );

    bot._intervals ||= {};
    bot._positions ||= {};
    bot._positions[uid] = bot._positions[uid] || [];

    const appendCompat = getAppendCompat(sheetsClient);

    // loop
    bot._intervals[uid] = setInterval(async () => {
      try {
        const rawTokens = await quickNodeClient.scanNewTokens();
        const now = Date.now();

        const candidates = (rawTokens || [])
          .map(t => ({
            ...t,
            ageMinutes: t.launchTimestamp ? (now - t.launchTimestamp)/60000 : t.ageMinutes
          }))
          .filter(t =>
            Number(t.ageMinutes) >= 1 &&
            Number(t.ageMinutes) <= 5 &&
            Number(t.metrics?.liquidity) >= 150 &&
            Number(t.metrics?.fdv)       <= 300000 &&
            Number(t.metrics?.holders)   <= 400 &&
            Number(t.metrics?.volume)    >= 1500
          );

        if (!candidates.length) return;

        for (const cand of candidates) {
          const mintAddress = cand.mint || cand.mintAddress;
          if (!mintAddress) continue;

          // enriquecer
          const intel = await enrichMint(mintAddress).catch(()=>null);
          if (intel) {
            cand.symbol  = cand.symbol || intel.symbol || (mintAddress?.slice(0,6)+'…');
            cand.priceUsd = cand.priceUsd ?? intel.priceUsd ?? cand.priceUsd;
            cand.metrics  = cand.metrics || {};
            cand.metrics.holders   = cand.metrics.holders   ?? intel.holders;
            cand.metrics.liquidity = cand.metrics.liquidity ?? intel.liqSol;
            cand.metrics.fdv       = cand.metrics.fdv       ?? intel.fdv;
            cand.metrics.volume    = cand.metrics.volume    ?? intel.volume1mUsd;
            cand.url               = cand.url || intel.url || cand.url;
            cand.__intel           = intel;
          }

          // Anti-FOMO: 45s desde pairCreatedAt
          const pairCreatedAt = intel?.pairCreatedAt || cand.pairCreatedAt || null;
          if (pairCreatedAt) {
            const ageSec = Math.max(0, Math.round((Date.now() - Number(pairCreatedAt)) / 1000));
            if (ageSec < MIN_AGE_SECONDS) continue;
          }

          // Guard
          const enabled   = (bot._guardEnabled?.[uid] !== undefined) ? !!bot._guardEnabled[uid] : true;
          const modeGuard = bot._guardMode?.[uid] || 'hard';
          if (enabled) {
            const verdict = await canBuyToken(cand).catch(()=>({ ok:true, reasons:[] }));
            if (!verdict.ok) {
              const warn = `🛡️ Guard (${modeGuard}) — Riesgos: ${verdict.reasons.join(', ')}`;
              if (modeGuard === 'hard') {
                await bot.sendMessage(chatId, `⛔ ${warn}\n🪙 ${cand.symbol || mintAddress}`);
                continue;
              } else {
                await bot.sendMessage(chatId, `⚠️ ${warn}\n🪙 ${cand.symbol || mintAddress}\n(se deja pasar por modo *soft*)`, { parse_mode: 'Markdown' });
              }
            }
          }

          // Monto + slippage
          const cfgAmount2 = bot.sniperConfig?.[uid]?.monto;
          const envAmount2 = parseFloat(process.env.FIXED_TRADE_AMOUNT);
          let amountUsd = (Number.isFinite(cfgAmount2) && cfgAmount2 > 0)
            ? cfgAmount2
            : (Number.isFinite(envAmount2) && envAmount2 > 0)
            ? envAmount2
            : 25;

          const solUsd = intel?.solUsd || await getSolUsd().catch(()=>null);
          const bps    = await computeDynamicSlippageBps(bot, cand, { amountUsd, solUsd }).catch(()=>150);
          const slippagePct = Number((bps / 100).toFixed(2));

          // Comprar
          let txHash;
          const isDemo = bot.demoMode?.[uid] || (!bot.demoMode?.[uid] && !bot.realMode?.[uid]);
          if (isDemo) {
            txHash = 'MOCK_BUY_' + Date.now();
            console.log(`(DEMO) $${amountUsd} mint ${mintAddress} slippage=${slippagePct}%`);
          } else {
            txHash = await phantomClient.buyToken({
              mintAddress,
              amountUsd,
              slippage: slippagePct,
              inputMint: SOL_MINT
            });
          }

          const entry = Number(cand.priceUsd ?? cand.currentPrice ?? 0);
          const pos = {
            txSignature: txHash,
            mintAddress,
            tokenSymbol: cand.symbol,
            entryPrice:  entry,
            amountToken: entry ? (amountUsd / entry) : 0,
            soldTargets: [],
            __intel: cand.__intel || null
          };
          bot._positions[uid].push(pos);

          // Sheets: BUY (A..Z)
          try {
            const append = appendCompat;
            if (append) {
              const mode = isDemo ? 'DEMO' : 'REAL';
              const sheetName = mode;
              const row = [
                ...nowRowPrefix(uid, mode),                // A..D
                'BUY',                                     // E type
                cand.symbol || '',                         // F token
                mintAddress,                               // G mint
                Number(amountUsd) || '',                   // H amount_usd
                Number(pos.amountToken) || '',             // I qty_tokens
                Number(entry) || '',                       // J entry_price_usd
                '',                                        // K exit_price_usd
                Number(slippagePct) || '',                 // L slippage_pct
                txHash,                                    // M tx
                'MARKET',                                  // N src
                Number(cand.ageMinutes) || '',             // O age_min
                Number(cand.metrics?.liquidity) || '',     // P liq_sol
                Number(cand.metrics?.fdv) || '',           // Q fdv_usd
                Number(cand.metrics?.holders) || '',       // R holders
                Number(cand.metrics?.volume) || '',        // S vol_usd_min
                (bot._guardMode?.[uid] || 'hard'),         // T guard_mode
                (cand.__intel?.risk?.flags || []).join('|') || '', // U guard_flags
                Number(cand.__intel?.whaleScore ?? 0) || 0,         // V whale_signal
                Number(cand.__intel?.discordScore ?? 0) || 0,       // W discord_signal
                Number(cand.__intel?.intelScore ?? 0) || 0,         // X intel_score
                '',                                        // Y pnl_usd
                ''                                         // Z pnl_pct
              ];
              await append(row, { sheetName, ensureHeader: true, headers: HEADERS_AZ });
            }
          } catch (e) {
            console.error('[Sheets] compra error:', e?.message || e);
          }

          // Supabase: BUY
          try {
            await supabaseClient.upsertTrade({
              fecha_hora: new Date().toISOString(),
              mode: isDemo ? 'DEMO' : 'REAL',
              token: cand.symbol || '',
              mint: mintAddress,
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
            console.error('[Supabase] BUY error:', e?.message || e);
          }

          // Noti
          const modeNow = isDemo ? 'DEMO' : 'REAL';
          await bot.sendMessage(
            chatId,
            `✅ *COMPRA EJECUTADA ${modeNow}*\n` +
            `🪙 ${cand.symbol || mintAddress}\n` +
            `💵 Monto: $${amountUsd.toFixed(2)}\n` +
            `📥 Entrada: ${entry || '–'}\n` +
            `💸 Slippage: ${slippagePct}%\n` +
            (cand.url ? `🔗 ${cand.url}\n` : '') +
            `🔐 TX: \`${txHash}\``,
            { parse_mode: 'Markdown' }
          );
        }

      } catch (err) {
        console.error(`❌ Error en sniper loop [${uid}]:`, err);
      }
    }, scanMs);

    // Monitor Stop-Profit global
    if (!bot._stopProfitInterval) {
      bot._stopProfitInterval = setInterval(async () => {
        try {
          const positionsByUser = bot._positions || {};
          const userIds = Object.keys(positionsByUser);

          for (const u of userIds) {
            const chatIdU = Number(u);
            const positions = positionsByUser[u] || [];
            const appendU = getAppendCompat(sheetsClient);

            for (const pos of positions) {
              const mint = pos.mintAddress || pos.tokenMint || null;
              let priceNow = null;
              try { priceNow = await quickNodeClient.getPrice(mint ?? pos.tokenSymbol); } catch {}
              const entry = Number(pos.entryPrice);
              if (!priceNow || !entry) continue;

              const gain = Number(priceNow) / entry;
              let soldInThisCycle = false;

              for (const rule of stopProfitRules) {
                if (pos.soldTargets?.includes(rule.target)) continue;
                if (gain < rule.target) continue;

                const percent = Math.max(0, Math.min(100, Math.round(rule.sellFrac * 100)));
                let txSell = 'MOCK_SELL_' + Date.now();

                try {
                  const isDemoU = bot.demoMode?.[u] || (!bot.demoMode?.[u] && !bot.realMode?.[u]);
                  if (!isDemoU) {
                    txSell = await phantomClient.sellToken({
                      buyTxSignature: pos.txSignature,
                      percent
                    });
                  }
                } catch (e) {
                  console.error('[SELL] error phantomClient.sellToken:', e?.message || e);
                  continue;
                }

                // calcular porción y PnL
                const sellFrac = Math.max(0, Math.min(1, rule.sellFrac));
                const sellQty  = Number(pos.amountToken || 0) * sellFrac;
                const revenue  = sellQty * Number(priceNow);
                const cost     = sellQty * Number(entry);
                const pnlUsd   = (Number.isFinite(revenue) && Number.isFinite(cost)) ? (revenue - cost) : null;
                const pnlPct   = (entry > 0) ? ((Number(priceNow)/entry - 1)*100) : null;

                // actualizar cantidad remanente
                pos.amountToken = Math.max(0, Number(pos.amountToken || 0) - sellQty);

                // Sheets: SELL (A..Z)
                try {
                  if (appendU) {
                    const isDemoU = bot.demoMode?.[u] || (!bot.demoMode?.[u] && !bot.realMode?.[u]);
                    const mode = isDemoU ? 'DEMO' : 'REAL';
                    const sheetName = mode;
                    const row = [
                      ...nowRowPrefix(u, mode),                 // A..D
                      `SELL_${Math.round(rule.target*100)}%`,  // E type
                      pos.tokenSymbol || pos.mintAddress || '',// F token
                      pos.mintAddress || '',                   // G mint
                      '',                                      // H amount_usd
                      Number(sellQty) || '',                   // I qty_tokens
                      Number(entry) || '',                     // J entry_price_usd
                      Number(priceNow) || '',                  // K exit_price_usd
                      '',                                      // L slippage_pct
                      txSell,                                  // M tx
                      'MARKET',                                // N src
                      '', '', '', '', '',                      // O..S vacíos en venta
                      (bot._guardMode?.[u] || 'hard'),         // T guard_mode
                      '',                                      // U guard_flags
                      Number(pos.__intel?.whaleScore ?? 0) || 0,    // V
                      Number(pos.__intel?.discordScore ?? 0) || 0,  // W
                      Number(pos.__intel?.intelScore ?? 0) || 0,    // X
                      Number.isFinite(pnlUsd) ? Number(pnlUsd) : '',// Y
                      Number.isFinite(pnlPct) ? Number(pnlPct) : '' // Z
                    ];
                    await appendU(row, { sheetName, ensureHeader: true, headers: HEADERS_AZ });
                  }
                } catch (e) {
                  console.error('[Sheets] venta error:', e?.message || e);
                }

                // Supabase: SELL
                try {
                  const isDemoU = bot.demoMode?.[u] || (!bot.demoMode?.[u] && !bot.realMode?.[u]);
                  await supabaseClient.upsertTrade({
                    fecha_hora: new Date().toISOString(),
                    mode: isDemoU ? 'DEMO' : 'REAL',
                    token: pos.tokenSymbol || pos.mintAddress || '',
                    mint: pos.mintAddress || '',
                    entrada_usd: Number(entry) || null,
                    salida_usd: Number(priceNow) || null,
                    inversion_usd: null,
                    pnl_usd: pnlUsd,
                    pnl_pct: pnlPct,
                    slippage_pct: null,
                    volumen_24h_usd: null,
                    liquidez_usd: null,
                    holders: null,
                    fdv_usd: null,
                    marketcap_usd: null,
                    red: 'Solana',
                    fuente: 'MARKET',
                    url: null,
                    tx: txSell,
                    extra: pos.__intel ? JSON.stringify(pos.__intel) : null
                  });
                } catch (e) {
                  console.error('[Supabase] SELL error:', e?.message || e);
                }

                await bot.sendMessage(
                  chatIdU,
                  `🛑 *Stop Profit* +${(rule.target * 100).toFixed(0)}% → vendí ${percent}%\n` +
                  `🪙 ${pos.tokenSymbol || mint}\n` +
                  `📊 Precio: ${Number(priceNow).toFixed(6)}\n` +
                  `🔐 TX: \`${txSell}\``,
                  { parse_mode: 'Markdown' }
                );

                pos.soldTargets = Array.isArray(pos.soldTargets) ? pos.soldTargets : [];
                pos.soldTargets.push(rule.target);
                soldInThisCycle = true;
                break;
              }

              if (soldInThisCycle) continue;
            }
          }
        } catch (e) {
          console.error('[StopProfit] monitor error:', e);
        }
      }, 5_000);
    }
  });

  // /stop — detiene loop y monitor
  bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);

    if (bot._intervals?.[uid]) {
      clearInterval(bot._intervals[uid]);
      delete bot._intervals[uid];
    }
    if (bot._stopProfitInterval) {
      clearInterval(bot._stopProfitInterval);
      bot._stopProfitInterval = null;
    }
    await bot.sendMessage(chatId, '🔴 Sniper Automático DETENIDO');
  });

  // /debug — fuerza venta (NO escribe en Sheets/Supabase)
  bot.onText(/\/debug/, async (msg) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);

    if (bot._positions && bot._positions[uid] && bot._positions[uid].length) {
      bot._positions[uid][0].entryPrice = 0.001;
      bot._positions[uid][0]._debugSell = true;

      if (typeof quickNodeClient?.getPrice === 'function') {
        quickNodeClient.getPrice = async () => 0.01;
      }

      await bot.sendMessage(
        chatId,
        '🧪 Debug ON: entryPrice=0.001, priceNow=0.01 → activará Stop-Profit en el próximo ciclo (sin escribir en Sheets/Supabase).'
      );
    } else {
      await bot.sendMessage(chatId, 'No hay posiciones para debug. Primero ejecuta una compra.');
    }
  });

}
