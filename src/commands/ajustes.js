// ─────────────────────────────────────────────────────────────────────────────
// HUNTER X — /ajustes — HX-A08 — v2025-08-23 (ESM)
// Objetivo: panel mínimo para ajustar "monto por operación" (DEMO/REAL) por USUARIO.
//   • Un único mensaje que se edita (sin spam).
//   • Botones rápidos: presets y +/-.
//   • Entrada manual: /ajustes set 123   (validación 5–2000 USD).
//   • Persistencia por usuario en data/state.json (via state_compat.js).
// No modifica ninguna otra lógica del sniper.
// ─────────────────────────────────────────────────────────────────────────────

import { loadState, saveState } from '../services/state_compat.js';

const MIN = 5;
const MAX = 2000;

// Defaults provenientes de .env (si nunca se configuró nada por usuario)
const DEF_DEMO = clampNum(process.env.SNIPER_BASE_DEMO_USD, 100, MIN, MAX);
const DEF_REAL = clampNum(process.env.SNIPER_BASE_REAL_USD, 100, MIN, MAX);

const SLOTS = new Map(); // chatId -> { msgId, lastSig }

function clampNum(v, def, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, n));
}

function getUserConfig(uid) {
  const st = loadState();
  st.userCfg = st.userCfg || {};         // { [uid]: { baseDemo, baseReal } }
  const u = st.userCfg[uid] || {};
  const baseDemo = clampNum(u.baseDemo, DEF_DEMO, MIN, MAX);
  const baseReal = clampNum(u.baseReal, DEF_REAL, MIN, MAX);
  return { st, u, baseDemo, baseReal };
}

function setUserBase(uid, which, valueUsd) {
  const st = loadState();
  st.userCfg = st.userCfg || {};
  const u = st.userCfg[uid] || {};
  if (which === 'demo') u.baseDemo = clampNum(valueUsd, DEF_DEMO, MIN, MAX);
  else                  u.baseReal = clampNum(valueUsd, DEF_REAL, MIN, MAX);
  st.userCfg[uid] = u;
  saveState(st);
  return { baseDemo: u.baseDemo ?? DEF_DEMO, baseReal: u.baseReal ?? DEF_REAL };
}

function escMd(s='') {
  return String(s)
    .replace(/\\/g,'\\\\')
    .replace(/(\*|_|\[|\]|\(|\))/g,'\\$1');
}

function fmtUsd(n){ return '$' + Number(n||0).toFixed(2); }

function renderText({ mode, baseDemo, baseReal }) {
  const lines = [];
  lines.push('🛠️ *Ajustes — Monto por operación*');
  lines.push('');
  lines.push(`🔐 Modo activo: *${mode}*`);
  lines.push(`🎛️ DEMO: *${fmtUsd(baseDemo)}*  |  💳 REAL: *${fmtUsd(baseReal)}*`);
  lines.push('');
  lines.push('Usá los botones para ajustar rápido o enviá:');
  lines.push('`/ajustes set 123`  →  establece el monto del *modo activo*');
  lines.push('');
  lines.push('_Rango permitido:_ 5–2000 USD');
  return lines.join('\n');
}

function buildKb({ activeKey }) {
  // activeKey: 'demo' | 'real' (para mostrar qué se va a editar)
  const presets = [25, 50, 100, 250, 500, 1000];
  const rows = [];

  // Toggle de modo de edición (no cambia el modo del sniper, sólo a qué monto aplican los botones)
  rows.push([
    { text: activeKey === 'demo' ? '✅ Editar DEMO' : 'Editar DEMO', callback_data: 'aj:edit:demo' },
    { text: activeKey === 'real' ? '✅ Editar REAL' : 'Editar REAL', callback_data: 'aj:edit:real' },
  ]);

  // Presets
  rows.push(presets.slice(0,3).map(v => ({ text: `$${v}`, callback_data: `aj:set:${activeKey}:${v}` })));
  rows.push(presets.slice(3).map(v => ({ text: `$${v}`, callback_data: `aj:set:${activeKey}:${v}` })));

  // +/- pequeños y grandes
  rows.push([
    { text: '−5',  callback_data: `aj:add:${activeKey}:-5` },
    { text: '−25', callback_data: `aj:add:${activeKey}:-25` },
    { text: '+25', callback_data: `aj:add:${activeKey}:25` },
    { text: '+5',  callback_data: `aj:add:${activeKey}:5` },
  ]);

  // Refrescar / ayuda
  rows.push([
    { text: '🔄 Refrescar', callback_data: 'aj:refresh' },
    { text: '⌨️ Usar teclado', callback_data: 'aj:hint' },
  ]);

  return { inline_keyboard: rows };
}

async function renderOrEdit(bot, chatId, uid, opts = {}) {
  const slot = SLOTS.get(chatId) || {};
  const activeKey = opts.activeKey || slot.activeKey || (bot.realMode?.[uid] ? 'real' : 'demo');
  const mode = bot.realMode?.[uid] ? 'REAL' : 'DEMO';

  const { baseDemo, baseReal } = getUserConfig(uid);
  const text = renderText({ mode, baseDemo, baseReal });
  const kb = buildKb({ activeKey });

  const sig = text + '|' + JSON.stringify(kb) + '|' + activeKey;
  if (slot.msgId && slot.lastSig === sig) return;

  if (!slot.msgId) {
    const sent = await bot.sendMessage(chatId, text, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: kb,
    });
    slot.msgId = sent.message_id;
  } else {
    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: slot.msgId,
      parse_mode: 'Markdown',
      disable_web_page_preview: true,
      reply_markup: kb,
    }).catch(e=>{
      const m = String(e?.message||e||'');
      if (!/message is not modified/i.test(m)) console.error('[ajustes] edit:', m);
    });
  }

  slot.lastSig = sig;
  slot.activeKey = activeKey;
  SLOTS.set(chatId, slot);
}

function applyDelta(current, delta){
  return clampNum(Number(current) + Number(delta), current, MIN, MAX);
}

export default function registerAjustes(bot) {
  // /ajustes  → abre panel
  bot.onText(/^\s*\/ajustes\s*$/i, async (msg) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);
    try {
      await renderOrEdit(bot, chatId, uid);
    } catch (e) {
      await bot.sendMessage(chatId, '❌ No se pudo abrir /ajustes').catch(()=>{});
    }
  });

  // /ajustes set 123  → setea en el modo ACTIVO (REAL/DEMO)
  bot.onText(/^\s*\/ajustes\s+set\s+(\d{1,4})\s*$/i, async (msg, m) => {
    const chatId = msg.chat.id;
    const uid = String(msg.from.id);
    const raw = Number(m?.[1] || 0);
    const val = clampNum(raw, raw, MIN, MAX);
    const key = bot.realMode?.[uid] ? 'real' : 'demo';
    setUserBase(uid, key, val);
    await bot.sendMessage(chatId, `✅ Monto ${key.toUpperCase()} actualizado a ${fmtUsd(val)}.`).catch(()=>{});
    await renderOrEdit(bot, chatId, uid, { activeKey: key });
  });

  // Callbacks
  bot.on('callback_query', async (q) => {
    const data = String(q.data || '');
    if (!data.startsWith('aj:')) return;

    const chatId = q.message?.chat?.id;
    const uid    = String(q.from?.id || '');
    if (!chatId || !uid) return;

    try {
      if (data === 'aj:refresh') {
        await renderOrEdit(bot, chatId, uid);
        return void bot.answerCallbackQuery(q.id).catch(()=>{});
      }
      if (data === 'aj:hint') {
        await bot.answerCallbackQuery(q.id, { text: 'Escribí: /ajustes set 123', show_alert: false }).catch(()=>{});
        return;
      }
      // aj:edit:demo|real
      let m = data.match(/^aj:edit:(demo|real)$/);
      if (m) {
        const key = m[1];
        await renderOrEdit(bot, chatId, uid, { activeKey: key });
        return void bot.answerCallbackQuery(q.id, { text: `Editando ${key.toUpperCase()}` }).catch(()=>{});
      }
      // aj:set:demo|real:VAL
      m = data.match(/^aj:set:(demo|real):(\d{1,4})$/);
      if (m) {
        const key = m[1];
        const val = clampNum(Number(m[2]||0), 100, MIN, MAX);
        setUserBase(uid, key, val);
        await renderOrEdit(bot, chatId, uid, { activeKey: key });
        return void bot.answerCallbackQuery(q.id, { text: `Monto ${key.toUpperCase()}: ${fmtUsd(val)}` }).catch(()=>{});
      }
      // aj:add:demo|real:DELTA
      m = data.match(/^aj:add:(demo|real):(-?\d{1,4})$/);
      if (m) {
        const key   = m[1];
        const delta = Number(m[2]||0);
        const { baseDemo, baseReal } = getUserConfig(uid);
        const cur = key === 'demo' ? baseDemo : baseReal;
        const next = clampNum(cur + delta, cur + delta, MIN, MAX);
        setUserBase(uid, key, next);
        await renderOrEdit(bot, chatId, uid, { activeKey: key });
        return void bot.answerCallbackQuery(q.id, { text: `Monto ${key.toUpperCase()}: ${fmtUsd(next)}` }).catch(()=>{});
      }

      await bot.answerCallbackQuery(q.id).catch(()=>{});
    } catch (e) {
      try { await bot.answerCallbackQuery(q.id, { text:'⚠️ Error' }); } catch {}
    }
  });

  console.log('✅ Handler cargado: ajustes.js (HX-A08)');
}
