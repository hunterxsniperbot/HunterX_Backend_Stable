// ─────────────────────────────────────────────────────────────────────────────
// HUNTER X — /registro — HX-A07 — v2025-08-23 (ESM)
// Muestra operaciones CERRADAS (SELL) con:
//   • Tabs de período: Hoy | Semana | Mes
//   • Paginación: ⬅️  Página X/Y  ➡️
//   • Resumen (PnL total, ganadoras/perdedoras, mayor win/loss)
//   • Link opcional a Google Sheets (si GOOGLE_SHEETS_ID está seteado)
//   • Mensaje ÚNICO por chat que se edita (sin spam)
// Requiere: SUPABASE_URL, SUPABASE_KEY  (REST habilitado)
// Opcional: GOOGLE_SHEETS_ID (para botón que abre la planilla)
//
// Criterios (A07):
//   - Un único mensaje por chat (editMessageText).
//   - Tabs cambian período y resetean a página 1.
//   - Sin NaN/undefined: se muestran guiones “–” cuando faltan números.
//   - Links sólo si hay mint.
//   - Modo se toma de bot.realMode[uid] (REAL/DEMO).
// ─────────────────────────────────────────────────────────────────────────────

import fetch from 'node-fetch';

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const SHEET_ID     = process.env.GOOGLE_SHEETS_ID || null;

const PAGE_SIZE = 5;
const TZ        = process.env.TZ_REGISTRO || 'America/Argentina/Buenos_Aires';

// Estado por chat: recordamos msgId para editar y snapshot para evitar “not modified”
const SLOTS = new Map(); // chatId -> { msgId, lastSig }

// ─────────────────────────────────────────────────────────────────────────────
// Helpers generales
// ─────────────────────────────────────────────────────────────────────────────

function escMd(s = '') {
  // Telegram Markdown (no V2): escapamos *, _, [, ] y ( )
  return String(s)
    .replace(/\\/g, '\\\\')
    .replace(/(\*|_|\[|\]|\(|\))/g, '\\$1');
}

function fmtNum(n, d = 2) {
  if (n == null || Number.isNaN(n)) return '–';
  const v = Number(n);
  if (!Number.isFinite(v)) return '–';
  return v.toFixed(d);
}

function fmtUsd(n) {
  if (n == null || Number.isNaN(n)) return '–';
  const v = Number(n);
  if (!Number.isFinite(v)) return '–';
  return '$' + v.toFixed(2);
}

function toUtcIso(d) { return new Date(d).toISOString(); }

function startOfTodayTZ() {
  const nowLocal = new Date(new Date().toLocaleString('en-US', { timeZone: TZ }));
  nowLocal.setHours(0,0,0,0);
  // Convertimos ese “local midnight” a tiempo real (UTC ISO) sin romper
  return new Date(nowLocal.getTime() - nowLocal.getTimezoneOffset() * 60000);
}

function startOfDaysAgoTZ(days) {
  const d = startOfTodayTZ();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function hashStr(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return String(h);
}

// ─────────────────────────────────────────────────────────────────────────────
// Supabase REST
// ─────────────────────────────────────────────────────────────────────────────

async function supaSelect(view, params = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_KEY');
  }
  const url = new URL(`${SUPABASE_URL}/rest/v1/${view}`);
  if (params.select) url.searchParams.set('select', params.select);
  if (params.limit)  url.searchParams.set('limit', String(params.limit));
  if (params.order?.col) {
    url.searchParams.set('order', `${params.order.col}.${params.order.dir || 'asc'}`);
  }
  if (params.filter) {
    for (const [k, v] of Object.entries(params.filter)) url.searchParams.set(k, v);
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
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Supabase ${view}: ${res.status} ${text}`);
  }
  return await res.json();
}

// ─────────────────────────────────────────────────────────────────────────────
// Dominio /registro
// ─────────────────────────────────────────────────────────────────────────────

async function fetchClosedTrades({ mode, period }) {
  let fromUtcISO;
  if (period === 'hoy')      fromUtcISO = toUtcIso(startOfTodayTZ());
  else if (period === 'semana') fromUtcISO = toUtcIso(startOfDaysAgoTZ(6));
  else                        fromUtcISO = toUtcIso(startOfDaysAgoTZ(29)); // “mes”: últimos 30 días

  const rows = await supaSelect('v_trades_sells', {
    filter: { mode: `eq.${mode}`, fecha_hora: `gte.${fromUtcISO}` },
    select: 'token,mint,entrada_usd,salida_usd,pnl_usd,pnl_pct,fecha_hora',
    order:  { col: 'fecha_hora', dir: 'desc' },
    limit:  5000
  });

  // resumen
  const total = rows.length;
  let wins = 0, losses = 0, pnlUsd = 0, pnlPctSum = 0;
  let maxWin = null, maxLoss = null;

  for (const r of rows) {
    const u = Number(r.pnl_usd ?? 0);
    const p = Number(r.pnl_pct ?? 0);
    pnlUsd += (Number.isFinite(u) ? u : 0);
    pnlPctSum += (Number.isFinite(p) ? p : 0);
    if (u > 0) wins++; else losses++;
    if (!maxWin  || (u > (Number(maxWin.pnl_usd)  || -Infinity))) maxWin  = r;
    if (!maxLoss || (u < (Number(maxLoss.pnl_usd) ||  Infinity))) maxLoss = r;
  }
  const pnlPct = total ? (pnlPctSum / total) : 0;

  return {
    total,
    rows,
    summary: {
      count: total,
      wins,
      losses,
      pnlUsd,
      pnlPct,
      pnlSign: pnlUsd >= 0 ? '+' : '',
      pnlPctSign: pnlPct >= 0 ? '+' : '',
      maxWin,
      maxLoss
    }
  };
}

function rowToText(r) {
  const when = new Date(r.fecha_hora).toLocaleString('es-AR', { timeZone: TZ });
  const sym  = r.token ? escMd(r.token) : (r.mint ? escMd(r.mint.slice(0, 6) + '…') : '–');

  const pnlUsd = Number(r.pnl_usd ?? 0);
  const pnlPct = Number(r.pnl_pct ?? 0);
  const sign   = pnlUsd >= 0 ? '+' : '';
  const pSign  = pnlPct >= 0 ? '+' : '';

  const dexs = r.mint ? `https://dexscreener.com/solana/${r.mint}` : null;
  const scan = r.mint ? `https://solscan.io/token/${r.mint}` : null;

  const links = (dexs || scan)
    ? `[DexScreener](${dexs})${dexs && scan ? ' | ' : ''}${scan ? `[Solscan](${scan})` : ''}`
    : '';

  return [
    `🪙 *${sym}*`,
    `🛒 Entrada: ${fmtUsd(r.entrada_usd)}  |  💰 Salida: ${fmtUsd(r.salida_usd)}`,
    `📈 PnL: ${sign}${fmtUsd(pnlUsd)} (${pSign}${fmtNum(pnlPct)}%)`,
    `📅 ${escMd(when)}`,
    links
  ].filter(Boolean).join('\n');
}

function buildMessageAndKb({ mode, period, page, total, rows, summary }) {
  const periodTag = period.toUpperCase();
  const header =
    `📜 *HunterX — Registro (${periodTag})*\n` +
    `🔐 Modo: ${mode}\n` +
    `🧾 Operaciones cerradas: ${total}\n`;

  const body = rows.length
    ? rows.map((r, i) => `#${(page * PAGE_SIZE) + i + 1}\n${rowToText(r)}`).join('\n\n')
    : '_No hay operaciones cerradas en el período._';

  const sum = summary ? (
    `\n\n📊 *Resumen ${period}:*\n` +
    `• Total PnL: ${summary.pnlSign}${fmtUsd(summary.pnlUsd).replace('$','') } USD (${summary.pnlPctSign}${fmtNum(summary.pnlPct)}%)\n` +
    `• Operaciones: ${summary.count} (Ganadoras: ${summary.wins} | Perdedoras: ${summary.losses})\n` +
    (summary.maxWin  ? `• Mayor ganancia: +${fmtNum(summary.maxWin.pnl_usd)} USD (${fmtNum(summary.maxWin.pnl_pct)}%)${summary.maxWin.token ? ` (${escMd(summary.maxWin.token)})` : ''}\n` : '') +
    (summary.maxLoss ? `• Mayor pérdida: ${fmtNum(summary.maxLoss.pnl_usd)} USD (${fmtNum(summary.maxLoss.pnl_pct)}%)${summary.maxLoss.token ? ` (${escMd(summary.maxLoss.token)})` : ''}` : '')
  ) : '';

  const text = `${header}\n${body}${sum}`;

  // Botones
  const kb = [];
  // Tabs período (resetean page a 0)
  const tabs = [
    { key: 'hoy',    label: period === 'hoy'    ? '✅ Hoy'    : 'Hoy' },
    { key: 'semana', label: period === 'semana' ? '✅ Semana' : 'Semana' },
    { key: 'mes',    label: period === 'mes'    ? '✅ Mes'    : 'Mes' },
  ].map(t => ({ text: t.label, callback_data: `reg|${mode}|${t.key}|0` }));
  kb.push(tabs);

  // Paginación
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasPrev = page > 0;
  const hasNext = (page + 1) < totalPages;
  const navRow = [];
  if (hasPrev) navRow.push({ text: '⬅️ Anterior', callback_data: `reg|${mode}|${period}|${page - 1}` });
  navRow.push({ text: `Página ${Math.min(page + 1, totalPages)}/${totalPages}`, callback_data: 'reg|noop|noop|noop' });
  if (hasNext) navRow.push({ text: '➡️ Siguiente', callback_data: `reg|${mode}|${period}|${page + 1}` });
  kb.push(navRow);

  // Sheets opcional
  if (SHEET_ID) {
    kb.push([{ text: `📤 Abrir Sheets (${mode})`, url: `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit` }]);
  }

  return { text, kb: { inline_keyboard: kb } };
}

// Render + edición de mensaje único
async function renderOrEdit(bot, chatId, state) {
  const { mode, period, page } = state;

  const data = await fetchClosedTrades({ mode, period });
  const safePage = Math.max(0, Math.min(page, Math.max(0, Math.ceil(data.total / PAGE_SIZE) - 1)));
  const slice = data.rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const { text, kb } = buildMessageAndKb({
    mode, period, page: safePage, total: data.total, rows: slice, summary: data.summary
  });

  const slot = SLOTS.get(chatId) || {};
  const sig = hashStr(JSON.stringify({ text, kb, mode, period, page: safePage }));

  if (slot.msgId && slot.lastSig === sig) {
    // Nada cambió: evitar “message is not modified”
    return;
  }

  if (!slot.msgId) {
    const sent = await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: kb
    });
    slot.msgId = sent.message_id;
  } else {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: slot.msgId,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: kb
    }).catch(e => {
      const m = String(e?.message || e || '');
      if (/message is not modified/i.test(m)) return;
      // si no se puede editar (por antigüedad), mandamos nuevo y reemplazamos msgId
      // pero evitamos “spam”: sólo 1 reemplazo
      try {
        SLOTS.delete(chatId);
      } catch {}
    });

    // si hicimos delete del slot, re-enviamos como nuevo
    if (!SLOTS.get(chatId)) {
      const sent = await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        reply_markup: kb
      });
      SLOTS.set(chatId, { msgId: sent.message_id, lastSig: sig });
      return;
    }
  }

  slot.lastSig = sig;
  SLOTS.set(chatId, slot);
}

// ─────────────────────────────────────────────────────────────────────────────
// Registro de comando
// ─────────────────────────────────────────────────────────────────────────────

export default function registerRegistro(bot) {
  // /registro [hoy|semana|mes]
  bot.onText(/^\s*\/registro(?:\s+(hoy|semana|mes))?\s*$/i, async (msg, match) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);
    const mode   = bot.realMode?.[uid] ? 'REAL' : 'DEMO';
    const period = (match?.[1] || 'hoy').toLowerCase();

    try {
      await renderOrEdit(bot, chatId, { mode, period, page: 0 });
    } catch (e) {
      await bot.sendMessage(chatId, `❌ /registro error: ${e.message || e}`).catch(()=>{});
    }
  });

  // Callbacks: reg|MODE|PERIOD|PAGE  (y reg|noop|noop|noop)
  bot.on('callback_query', async (q) => {
    const data = String(q.data || '');
    if (!data.startsWith('reg|')) return;

    try {
      const parts = data.split('|');
      if (parts[1] === 'noop') {
        // sólo cerramos el spinner
        await bot.answerCallbackQuery(q.id).catch(()=>{});
        return;
      }

      const mode   = (parts[1] || 'DEMO').toUpperCase() === 'REAL' ? 'REAL' : 'DEMO';
      const period = ['hoy','semana','mes'].includes((parts[2] || '').toLowerCase()) ? parts[2].toLowerCase() : 'hoy';
      const page   = Math.max(0, parseInt(parts[3] || '0', 10) || 0);

      await renderOrEdit(bot, q.message.chat.id, { mode, period, page });
      await bot.answerCallbackQuery(q.id).catch(()=>{});
    } catch (e) {
      try { await bot.answerCallbackQuery(q.id, { text: '⚠️ Error al actualizar' }); } catch {}
    }
  });

  console.log('✅ Handler cargado: registro.js (HX-A07)');
}
