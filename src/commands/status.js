// src/commands/status.js — /status con períodos: hoy | semana | mes
// Texto: modo, scan, guard, posiciones, último escaneo + counters
// Imagen:
//   - hoy:  barras (BUY por hora) + línea (equity intradía)
//   - semana/mes: barras (BUY por día) + línea (equity acumulada diaria)
// Requiere: SUPABASE_URL, SUPABASE_KEY (Service Role), node-fetch

import fetch from 'node-fetch';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
const TZ = 'America/Argentina/Buenos_Aires';
const SEND_CHART = (process.env.STATUS_CHARTS ?? '1') === '1'; // desactivar con STATUS_CHARTS=0

// ——— Supabase REST helper ———
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

// ——— Helpers tiempo / formato ———
function startOfTodayTZ() {
  const now = new Date();
  const localMidnight = new Date(now.toLocaleString('en-US', { timeZone: TZ }));
  localMidnight.setHours(0,0,0,0);
  return new Date(localMidnight.getTime() - localMidnight.getTimezoneOffset()*60000); // UTC Date of local midnight
}
function startOfDaysAgoTZ(days) {
  const d = startOfTodayTZ();
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}
function toUtcIso(d) { return new Date(d).toISOString(); }

function hourLabelAR(dUTC) {
  return new Date(dUTC).toLocaleTimeString('es-AR', { timeZone: TZ, hour: '2-digit' }); // "00".."23"
}
function dayLabelAR(dUTC) {
  return new Date(dUTC).toLocaleDateString('es-AR', { timeZone: TZ, month: '2-digit', day: '2-digit' }); // "dd/mm"
}
function fmt(n, d=2) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–';
  return Number(n).toFixed(d);
}

// ——— Construcción de datasets según período ———
function buildBuckets(period) {
  if (period === 'hoy') {
    const labels = Array.from({ length: 24 }, (_, i) => (i < 10 ? `0${i}` : `${i}`));
    const buys = labels.map(()=>0);
    const equity = labels.map(()=>0);
    return { kind: 'hourly', labels, buys, equity };
  }
  // semana (últimos 7 días) o mes (últimos 30 días) → por día
  const days = period === 'semana' ? 7 : 30;
  const start = startOfDaysAgoTZ(days-1); // incluye hoy → N etiquetas
  const labels = [];
  for (let i=0;i<days;i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    labels.push(dayLabelAR(d));
  }
  const buys = labels.map(()=>0);
  const equity = labels.map(()=>0);
  return { kind: 'daily', labels, buys, equity, startDateUtc: start };
}

// ——— Gráfico mixto (bar + line) ———
function buildChart(labels, buysData, equityData, title, xTitle, width=1000, height=500) {
  return {
    width, height, format: 'png', version: '4', backgroundColor: 'white',
    chart: {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { type: 'bar',  label: 'Compras',              data: buysData,   yAxisID: 'y'  },
          { type: 'line', label: 'Equity acumulado USD', data: equityData, yAxisID: 'y1' }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        maintainAspectRatio: false,
        plugins: {
          title: { display: true, text: title },
          legend: { display: true }
        },
        scales: {
          x:  { title: { display: true, text: xTitle } },
          y:  { title: { display: true, text: 'Buys' }, beginAtZero: true },
          y1: { position: 'right', title: { display: true, text: 'USD' }, beginAtZero: true, grid: { drawOnChartArea: false } }
        }
      }
    }
  };
}

export default function registerStatus(bot) {
  // admite /status y /status <periodo>
  bot.onText(/\/status(?:\s+(\S+))?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);

    // Estado runtime (como ya tenías)
    const mode = bot.realMode?.[uid] ? 'REAL' : (bot.demoMode?.[uid] ? 'DEMO' : 'DEMO');
    const scanMs  = bot.sniperConfig?.[uid]?.scanInterval ?? 15_000;
    const guardOn = (bot._guardEnabled?.[uid] !== undefined) ? !!bot._guardEnabled[uid] : true;
    const guardMd = bot._guardMode?.[uid] || 'hard';

    const last = bot._lastScan?.[uid] || {};
    const seen = last.seen ?? 0;
    const ok   = last.filtered ?? 0;
    const bought = last.bought ?? 0;
    const reasons = last.reasons ? JSON.stringify(last.reasons) : '{}';
    const positions = (bot._positions?.[uid] || []).length;
    const ts  = last.ts ? new Date(last.ts).toLocaleString('es-AR', { timeZone: TZ }) : '—';

    const periodArg = (match?.[1] || 'hoy').toLowerCase(); // hoy|semana|mes
    const period = ['hoy','semana','mes'].includes(periodArg) ? periodArg : 'hoy';

    // Texto
    await bot.sendMessage(
      chatId,
      `📋 *HunterX* /status (${period.toUpperCase()})\n` +
      `🔐 Modo: ${mode}\n` +
      `⏱️ Scan: ${(scanMs/1000)|0}s\n` +
      `🛡️ Guard: ${guardOn ? guardMd.toUpperCase() : 'OFF'}\n` +
      `📦 Posiciones abiertas: ${positions}\n` +
      `🛰️ Último escaneo (${ts})\n` +
      `• pares vistos: ${seen}\n` +
      `• candidatos: ${ok}\n` +
      `• compras: ${bought}\n` +
      `• descartes: ${reasons}`,
      { parse_mode: 'Markdown' }
    );

    if (!SEND_CHART) return; // desactivar imagen si querés

    // Imagen por período
    try {
      // 1) Traer BUY y SELL desde el inicio del período (en UTC ISO)
      let fromUtcISO;
      if (period === 'hoy') fromUtcISO = toUtcIso(startOfTodayTZ());
      else if (period === 'semana') fromUtcISO = toUtcIso(startOfDaysAgoTZ(6));
      else fromUtcISO = toUtcIso(startOfDaysAgoTZ(29)); // mes: 30 días

      const buys = await supaSelect('v_trades_buys', {
        filter: { mode: `eq.${mode}`, fecha_hora: `gte.${fromUtcISO}` },
        select: 'fecha_hora',
        order: { col: 'fecha_hora', dir: 'asc' },
        limit: 5000
      });
      const sells = await supaSelect('v_trades_sells', {
        filter: { mode: `eq.${mode}`, fecha_hora: `gte.${fromUtcISO}` },
        select: 'fecha_hora,pnl_usd',
        order: { col: 'fecha_hora', dir: 'asc' },
        limit: 5000
      });

      if ((!buys || !buys.length) && (!sells || !sells.length)) {
        await bot.sendMessage(chatId, 'ℹ️ Sin datos en el período — no se genera imagen.');
        return;
      }

      // 2) Buckets
      const buckets = buildBuckets(period);
      if (buckets.kind === 'hourly') {
        // hoy: por hora
        for (const b of buys) {
          const h = hourLabelAR(new Date(b.fecha_hora));
          const idx = buckets.labels.indexOf(h);
          if (idx >= 0) buckets.buys[idx] += 1;
        }
        let equity = 0;
        let cursor = 0;
        for (const s of sells) {
          const h = hourLabelAR(new Date(s.fecha_hora));
          const idx = buckets.labels.indexOf(h);
          equity += Number(s.pnl_usd || 0);
          while (cursor <= idx && cursor < buckets.labels.length) {
            buckets.equity[cursor] = equity;
            cursor++;
          }
        }
        while (cursor < buckets.labels.length) {
          buckets.equity[cursor] = equity;
          cursor++;
        }
      } else {
        // semana/mes: por día
        const dayIndex = new Map(buckets.labels.map((lab, i) => [lab, i]));
        for (const b of buys) {
          const lab = dayLabelAR(new Date(b.fecha_hora));
          const idx = dayIndex.get(lab);
          if (idx !== undefined) buckets.buys[idx] += 1;
        }
        let equity = 0;
        let lastIdx = -1;
        for (const s of sells) {
          const lab = dayLabelAR(new Date(s.fecha_hora));
          const idx = dayIndex.get(lab);
          if (idx === undefined) continue;
          equity += Number(s.pnl_usd || 0);
          // rellenar desde lastIdx+1 hasta idx con el equity actual
          for (let j = (lastIdx+1); j <= idx; j++) buckets.equity[j] = equity;
          lastIdx = idx;
        }
        // rellenar lo que quede
        for (let j = lastIdx+1; j < buckets.labels.length; j++) buckets.equity[j] = equity;
      }

      // 3) Config Chart.js y POST a QuickChart
      const title =
        period === 'hoy'    ? `Status diario — ${mode}`
      : period === 'semana' ? `Status 7 días — ${mode}`
                            : `Status 30 días — ${mode}`;
      const xTitle = (period === 'hoy') ? 'Hora (AR)' : 'Día (AR)';

      const chartPayload = buildChart(buckets.labels, buckets.buys, buckets.equity, title, xTitle);

      const qcRes = await fetch('https://quickchart.io/chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chartPayload),
        timeout: 20000
      });
      if (!qcRes.ok) {
        const txt = await qcRes.text().catch(()=>qcRes.statusText);
        throw new Error(`QuickChart ${qcRes.status}: ${txt}`);
      }
      const arrBuf = await qcRes.arrayBuffer();
      const pngBuf = Buffer.from(arrBuf);

      await bot.sendPhoto(chatId, pngBuf, { caption: `📊 ${title}` });
    } catch (e) {
      await bot.sendMessage(chatId, `ℹ️ No se pudo generar la imagen: ${e.message || e}`);
    }
  });
}
