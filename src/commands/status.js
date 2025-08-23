// ─────────────────────────────────────────────────────────────────────────────
// HUNTER X — /status — HX-A06 — v2025-08-19 (ESM)
// Panel rápido: uptime, memoria, ENV clave, sniper ON y resumen de /api/salud.
// Formato: HTML (parse_mode:'HTML'), mensaje único por invocación.
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';

// Helpers de formato
function fmtHMS(sec) {
  sec = Math.max(0, Math.floor(Number(sec || 0)));
  const h = String(Math.floor(sec / 3600)).padStart(2, '0');
  const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}
function fmtMB(bytes) {
  const mb = Number(bytes || 0) / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}
function n(v, d = null) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}
function readBool(v, def = false) {
  if (v == null) return def;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase().trim());
}
function esc(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

// Fetch con timeout
async function getJson(url, timeoutMs = 2000, headers = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort('timeout'), timeoutMs);
  try {
    const r = await fetch(url, { signal: ac.signal, headers });
    const ok = r.ok;
    let json = null;
    try { json = await r.json(); } catch {}
    return { ok, status: r.status, json };
  } catch (e) {
    return { ok: false, status: 0, error: String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

// Resumen de salud (cuenta estados y calcula semáforo global)
function summarizeHealth(arr) {
  const counts = { OK:0, DEGRADED:0, CONFIG:0, DOWN:0, OTHER:0 };
  if (Array.isArray(arr)) {
    for (const it of arr) {
      const s = String(it?.status || '').toUpperCase();
      if (s in counts) counts[s]++; else counts.OTHER++;
    }
  }
  // Score simple: OK=1, DEG=0.5, DOWN=0
  const evalTot = counts.OK + counts.DEGRADED + counts.DOWN;
  const score = evalTot > 0 ? (counts.OK + counts.DEGRADED * 0.5) / evalTot : 0;
  const sem = score >= 0.85 ? '🟢' : score >= 0.60 ? '🟡' : '🔴';
  return { counts, sem };
}

export default function registerStatus(bot) {
  // Limpieza defensiva por si había otro listener
  bot.removeTextListener?.(/^\s*\/status\s*$/i);

  bot.onText(/^\s*\/status\s*$/i, async (msg) => {
    const chatId = msg.chat.id;

    // 1) Métricas de proceso
    const uptime = fmtHMS(process.uptime());
    const mem = process.memoryUsage?.() || {};
    const rss = fmtMB(mem.rss || 0);
    const heap = fmtMB(mem.heapUsed || 0);

    // 2) ENV clave (solo lectura)
    const ENV = {
      SCAN_INTERVAL_MS: n(process.env.SCAN_INTERVAL_MS, null),
      PROFILE: (process.env.PROFILE || 'maxseg').toLowerCase(),
      BASE_DEMO: n(process.env.SNIPER_BASE_DEMO_USD, null),
      BASE_REAL: n(process.env.SNIPER_BASE_REAL_USD, null),
      BUDGET_DEMO_H: n(process.env.BUDGET_DEMO_USD_PER_H, null),
      BUDGET_REAL_H: n(process.env.BUDGET_REAL_USD_PER_H, null),
      CD_RED_STREAK: n(process.env.COOLDOWN_RED_STREAK, null),
      CD_MS: n(process.env.COOLDOWN_MS, null),
      RENDER: readBool(process.env.RENDER, false),
    };

    // 3) Sniper: cuántos ON
    let sniperOnUsers = 0;
    try {
      const map = bot._sniperOn || {};
      sniperOnUsers = Object.values(map).filter(Boolean).length;
    } catch { sniperOnUsers = 0; }

    // 4) Salud (resumen de /api/salud)
    let healthSummary = 'No disponible';
    let healthLine = '—';
    try {
      const r = await getJson(`${API_BASE}/api/salud`, 1800);
      if (r.ok && Array.isArray(r.json)) {
        const { counts, sem } = summarizeHealth(r.json);
        healthSummary = `${sem}  ✅ OK: ${counts.OK} · 🟠 Deg: ${counts.DEGRADED} · ➖ Config: ${counts.CONFIG} · ❌ Down: ${counts.DOWN}`;
        healthLine = healthSummary;
      } else {
        healthLine = `❌ /api/salud no responde (${r.status || r.error || 'error'})`;
      }
    } catch (e) {
      healthLine = `❌ /api/salud error (${String(e?.message || e)})`;
    }

    // 5) Construcción del mensaje (HTML)
    const lines = [];
    lines.push('<b>🧭 HunterX — Status</b>');
    lines.push('');
    lines.push(`<b>Proceso</b>`);
    lines.push(`• Uptime: <code>${uptime}</code>`);
    lines.push(`• Memoria: <code>RSS ${esc(rss)}</code> · <code>Heap ${esc(heap)}</code>`);
    lines.push('');
    lines.push(`<b>Parámetros</b>`);
    lines.push(`• Scan interval: <code>${ENV.SCAN_INTERVAL_MS ?? '—'} ms</code>`);
    lines.push(`• Perfil: <code>${esc(ENV.PROFILE)}</code>`);
    lines.push(`• Base DEMO/REAL: <code>${ENV.BASE_DEMO ?? '—'}</code> / <code>${ENV.BASE_REAL ?? '—'}</code>`);
    lines.push(`• Budget DEMO/REAL (h): <code>${ENV.BUDGET_DEMO_H ?? '—'}</code> / <code>${ENV.BUDGET_REAL_H ?? '—'}</code>`);
    lines.push(`• Cooldown: <code>streak=${ENV.CD_RED_STREAK ?? '—'}</code> · <code>${ENV.CD_MS ?? '—'} ms</code>`);
    lines.push(`• Render flag: <code>${ENV.RENDER ? 'ON' : 'OFF'}</code>`);
    lines.push('');
    lines.push(`<b>Sniper</b>`);
    lines.push(`• Usuarios con Sniper ON: <code>${sniperOnUsers}</code>`);
    lines.push('');
    lines.push(`<b>Salud</b>`);
    lines.push(`• ${esc(healthLine)}`);
    lines.push('');
    lines.push(`Tip: para el detalle por servicio usá <code>/salud</code>.`);

    const text = lines.join('\n');

    try {
      await bot.sendMessage(chatId, text, {
        parse_mode: 'HTML',
        disable_web_page_preview: true
      });
    } catch (e) {
      await bot.sendMessage(chatId, '❌ No pude renderizar /status: ' + esc(e?.message || e), { parse_mode: 'HTML' });
    }
  });

  console.log('✅ Handler cargado: status.js (HX-A06)');
}
