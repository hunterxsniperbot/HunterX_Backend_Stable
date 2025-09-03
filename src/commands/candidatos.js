import { getSolanaPairs } from '../services/marketsPref.js';

const DEF_MIN_LIQ = Number(process.env.CANDS_MIN_LIQ_USD || 10000);
const DEF_MAX_FDV = Number(process.env.CANDS_MAX_FDV_USD || 2000000);
const DEF_QUOTES  = String(process.env.CANDS_ONLY_QUOTES || 'SOL,WSOL,USDC')
  .split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);

function fmtUsd(v){
  if (v == null || Number.isNaN(v)) return '—';
  const n = Number(v);
  return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}
function esc(s){ return String(s||'').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c])); }

function parseArgs(txt){
  // soporta: /candidatos [N] [raw] [liq=...] [fdv=...] [q=SOL,USDC]
  const out = { limit: 5, raw:false, minLiq:DEF_MIN_LIQ, maxFdv:DEF_MAX_FDV, quotes:[...DEF_QUOTES] };
  const m = txt.match(/^\/candidatos\b(.*)$/i);
  const rest = (m?.[1] || '').trim();
  if (!rest) return out;

  for (const tok of rest.split(/\s+/)){
    if (!tok) continue;
    if (/^\d+$/.test(tok)) { out.limit = Math.min(10, Math.max(3, Number(tok))); continue; }
    if (tok.toLowerCase() === 'raw') { out.raw = true; continue; }
    const kv = tok.split('=');
    if (kv.length === 2){
      const k = kv[0].toLowerCase();
      const v = kv[1];
      if (k === 'liq') out.minLiq = Math.max(0, Number(v||0));
      if (k === 'fdv') out.maxFdv = Math.max(0, Number(v||0));
      if (k === 'q')   out.quotes = String(v||'').split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
    }
  }
  return out;
}

export default function registerCandidatos(bot){
  console.log('✅ candidatos.js (dinámico + fallback)');
  bot.onText(/^\/candidatos(?:\b.*)?$/i, async (msg) => {
    const chatId = msg.chat.id;
    const args = parseArgs(msg.text || '');

    try{
      // pedimos bastante para poder filtrar
      const raw = await getSolanaPairs({ limit: Math.max(40, args.limit*5) }) || [];

      let picked = raw;
      let hdr = '<b>📊 Candidatos</b>';
      if (!args.raw){
        picked = raw.filter(p => {
          const liq = Number(p.liquidityUsd ?? 0);
          const fdv = Number(p.fdvUsd ?? Infinity);
          const q   = String(p.quoteSymbol || '').toUpperCase();
          if (liq < args.minLiq) return false;
          if (!Number.isFinite(fdv) || (args.maxFdv > 0 && fdv > args.maxFdv)) return false;
          if (args.quotes?.length && !args.quotes.includes(q)) return false;
          return true;
        });
        hdr += ` (liq ≥ ${fmtUsd(args.minLiq)}, FDV ≤ ${fmtUsd(args.maxFdv)}, quotes: ${(args.quotes||[]).join('/')})`;
      } else {
        hdr += ' <i>(raw)</i>';
      }

      if (!picked.length && raw.length){
        // fallback: mostrar sin filtros si hay data cruda pero nada matcheó
        picked = raw;
        hdr += '\n<i>⚠️ Sin matches con filtros; mostrando raw.</i>';
      }

      picked = picked.slice(0, args.limit);

      if (!picked.length){
        return bot.sendMessage(
          chatId,
          `❌ Sin candidatos (posible timeout de fuentes). Probá <code>/candidatos raw</code> o bajá filtros: <code>/candidatos 8 liq=5000 fdv=5000000</code>`,
          { parse_mode:'HTML' }
        );
      }

      const lines = picked.map((p, i) => {
        const base = esc(p.baseSymbol || '?');
        const quote= esc(p.quoteSymbol || '?');
        const liq  = fmtUsd(p.liquidityUsd);
        const fdv  = fmtUsd(p.fdvUsd);
        const px   = (p.priceUsd != null && !Number.isNaN(p.priceUsd)) ? ` · px $${Number(p.priceUsd).toFixed(6)}` : '';
        const gecko = p.pairAddress ? ` <a href="https://www.geckoterminal.com/solana/pools/${esc(p.pairAddress)}">[Gecko]</a>` : '';
        return `${i+1}. <b>${base} / ${quote}</b> · liq ${liq} · FDV ${fdv}${px}${gecko}`;
      });

      const txt = `${hdr}\n` + lines.join('\n') + `\n\nTip: <code>/candidatos raw</code> o <code>/candidatos 8 liq=5000 fdv=5000000</code>`;
      return bot.sendMessage(chatId, txt, { parse_mode: 'HTML', disable_web_page_preview: true });
    }catch(e){
      return bot.sendMessage(chatId, '❌ Error candidatos: ' + String(e?.message || e));
    }
  });
}
