// src/commands/registro.js — /registro (hoy|semana|mes) con paginación y resumen
// Muestra SOLO operaciones cerradas (SELL) desde v_trades_sells
// Requiere: SUPABASE_URL, SUPABASE_KEY, opcional GOOGLE_SHEETS_ID

import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const SHEET_ID     = process.env.GOOGLE_SHEETS_ID || null;

const TZ = 'America/Argentina/Buenos_Aires';
const PAGE_SIZE = 5;

// ——— Helpers Supabase (REST) ———
async function supaSelect(view, params = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env faltantes');
  const url = new URL(`${SUPABASE_URL.replace(/\/+$/,'')}/rest/v1/${view}`);
  if (params.select) url.searchParams.set('select', params.select);
  if (params.limit)  url.searchParams.set('limit', String(params.limit));
  if (params.order?.col) {
    url.searchParams.set('order', `${params.order.col}.${params.order.dir || 'asc'}`);
  }
  if (params.filter) {
    for (const [k, v] of Object.entries(params.filter)) {
      url.searchParams.set(k, v); // ej: mode=eq.DEMO
    }
  }
  const res = await fetch(url.toString(), {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Accept': 'application/json'
    },
    timeout: 15000
  });
  if (!res.ok) {
    const text = await res.text().catch(()=>res.statusText);
    throw new Error(`Supabase ${view}: ${res.status} ${text}`);
  }
  return await res.json();
}

// ——— Tiempo ———
function startOfTodayTZ() {
  const now = new Date();
  const localMidnight = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  localMidnight.setHours(0,0,0,0);
  return new Date(localMidnight.getTime() - localMidnight.getTimezoneOffset()*60000);
}
function startOfDaysAgoTZ(days) {
  const d = startOfTodayTZ();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}
function toUtcIso(d) { return new Date(d).toISOString(); }
function fmtNum(n, d=2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return Number(n).toFixed(d);
}

// ——— Texto de una fila SELL ———
function rowToText(r) {
  // r: { token, mint, entrada_usd, salida_usd, pnl_usd, pnl_pct, fecha_hora }
  const when = new Date(r.fecha_hora).toLocaleString('es-AR', { timeZone: TZ });
  const sym  = r.token || (r.mint ? r.mint.slice(0,6)+'…' : '—');
  const dexs = r.mint ? `https://dexscreener.com/solana/${r.mint}` : null;
  const scan = r.mint ? `https://solscan.io/token/${r.mint}` : null;

  const pnlUsd = Number(r.pnl_usd ?? 0);
  const pnlPct = Number(r.pnl_pct ?? 0);
  const sign   = pnlUsd >= 0 ? '+' : '';
  const pSign  = pnlPct >= 0 ? '+' : '';

  return [
    `🪙 ${sym}`,
    `🛒 Entrada: ${fmtNum(r.entrada_usd)}  |  💰 Salida: ${fmtNum(r.salida_usd)}`,
    `📈 PnL: ${sign}${fmtNum(pnlUsd)} USD (${pSign}${fmtNum(pnlPct)}%)`,
    `📅 ${when}`,
    (dexs || scan) ? `🔗 ${dexs ? 'DexScreener' : ''}${dexs && scan ? ' | ' : ''}${scan ? 'Solscan' : ''}` : ''
  ].filter(Boolean).join('\n');
}

// ——— Construcción de mensaje + botones ———
function buildMessageAndKb({ mode, period, page, total, rows, summary }) {
  const header =
    `📜 *HunterX — Registro (${period.toUpperCase()})*\n` +
    `🔐 Modo: ${mode}\n` +
    `🧾 Operaciones cerradas: ${total}\n`;
  const body = rows.length
    ? rows.map((r, i) => `#${(page*PAGE_SIZE)+i+1}\n${rowToText(r)}`).join('\n\n')
    : '_No hay operaciones cerradas en el período._';

  const sum = summary ? (
    `\n\n📊 *Resumen ${period}:*\n` +
    `• Total PnL: ${summary.pnlSign}${fmtNum(summary.pnlUsd)} USD (${summary.pnlPctSign}${fmtNum(summary.pnlPct)}%)\n` +
    `• Operaciones: ${summary.count} (Ganadoras: ${summary.wins} | Perdedoras: ${summary.losses})\n` +
    (summary.maxWin ? `• Mayor ganancia: +${fmtNum(summary.maxWin.pnl_usd)} USD (${fmtNum(summary.maxWin.pnl_pct)}%) ${summary.maxWin.token ? `(${summary.maxWin.token})` : ''}\n` : '') +
    (summary.maxLoss ? `• Mayor pérdida: ${fmtNum(summary.maxLoss.pnl_usd)} USD (${fmtNum(summary.maxLoss.pnl_pct)}%) ${summary.maxLoss.token ? `(${summary.maxLoss.token})` : ''}\n` : '')
  ) : '';

  const text = `${header}\n${body}${sum}`;

  // Botones
  const kb = [];
  const hasPrev = page > 0;
  const hasNext = (page+1) * PAGE_SIZE < total;

  const navRow = [];
  if (hasPrev) navRow.push({ text: '⬅️ Anterior', callback_data: `reg|${mode}|${period}|${page-1}` });
  if (hasNext) navRow.push({ text: '➡️ Siguiente', callback_data: `reg|${mode}|${period}|${page+1}` });
  if (navRow.length) kb.push(navRow);

  if (SHEET_ID) {
    // Abre la planilla (pestaña DEMO/REAL)
    kb.push([{ text: `📤 Abrir Sheets (${mode})`, url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit` }]);
  }

  return { text, kb: { inline_keyboard: kb } };
}

// ——— Carga de datos del período ———
async function fetchClosedTrades({ mode, period }) {
  let fromUtcISO;
  if (period === 'hoy')      fromUtcISO = toUtcIso(startOfTodayTZ());
  else if (period === 'semana') fromUtcISO = toUtcIso(startOfDaysAgoTZ(6));
  else                        fromUtcISO = toUtcIso(startOfDaysAgoTZ(29)); // mes: 30 días

  const rows = await supaSelect('v_trades_sells', {
    filter: { mode: `eq.${mode}`, fecha_hora: `gte.${fromUtcISO}` },
    select: 'token,mint,entrada_usd,salida_usd,pnl_usd,pnl_pct,fecha_hora',
    order: { col: 'fecha_hora', dir: 'desc' },
    limit: 5000
  });

  // summary
  const total = rows.length;
  let wins = 0, losses = 0, pnlUsd = 0, pnlPctSum = 0;
  let maxWin = null, maxLoss = null;

  for (const r of rows) {
    const u = Number(r.pnl_usd ?? 0);
    const p = Number(r.pnl_pct ?? 0);
    pnlUsd += u;
    pnlPctSum += p;
    if (u > 0) wins++; else losses++;
    if (!maxWin || (u > maxWin.pnl_usd))  maxWin  = r;
    if (!maxLoss || (u < maxLoss.pnl_usd)) maxLoss = r;
  }
  const pnlPct = total ? (pnlPctSum / total) : 0;

  return {
    total,
    rows,
    summary: {
      count: total,
      wins, losses,
      pnlUsd,
      pnlPct,
      pnlSign: pnlUsd >= 0 ? '+' : '',
      pnlPctSign: pnlPct >= 0 ? '+' : '',
      maxWin,
      maxLoss
    }
  };
}

export default function registerRegistro(bot) {
  // /registro [hoy|semana|mes]
  bot.onText(/\/registro(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);

    const mode =
      bot.realMode?.[uid] ? 'REAL'
      : (bot.demoMode?.[uid] ? 'DEMO' : 'DEMO');

    const arg = (match?.[1] || 'hoy').toLowerCase();
    const period = ['hoy','semana','mes'].includes(arg) ? arg : 'hoy';

    try {
      const data = await fetchClosedTrades({ mode, period });
      const page = 0;
      const slice = data.rows.slice(page*PAGE_SIZE, (page+1)*PAGE_SIZE);
      const { text, kb } = buildMessageAndKb({
        mode, period, page, total: data.total, rows: slice, summary: data.summary
      });

      await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: kb
      });
    } catch (e) {
      await bot.sendMessage(chatId, `❌ /registro error: ${e.message || e}`);
    }
  });

  // Callbacks de paginación: reg|MODE|PERIOD|PAGE
  bot.on('callback_query', async (q) => {
    try {
      const data = q.data || '';
      if (!data.startsWith('reg|')) return;

      const [_, mode, period, pageStr] = data.split('|');
      const page = Math.max(0, parseInt(pageStr, 10) || 0);

      const rowsData = await fetchClosedTrades({ mode, period });
      const slice = rowsData.rows.slice(page*PAGE_SIZE, (page+1)*PAGE_SIZE);
      const { text, kb } = buildMessageAndKb({
        mode, period, page, total: rowsData.total, rows: slice, summary: rowsData.summary
      });

      await bot.editMessageText(text, {
        chat_id: q.message.chat.id,
        message_id: q.message.message_id,
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: kb
      });

      await bot.answerCallbackQuery(q.id).catch(()=>{});
    } catch (e) {
      // si falla editar (ej: mucho tiempo), mandamos nuevo mensaje
      try {
        await bot.sendMessage(q.message.chat.id, `ℹ️ No se pudo actualizar la página: ${e.message || e}`);
      } catch {}
      try { await bot.answerCallbackQuery(q.id).catch(()=>{}); } catch {}
    }
  });
}
