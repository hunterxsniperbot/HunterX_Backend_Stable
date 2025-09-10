import { sumClosedPnL } from "../services/supa.js";

/* ===== Helpers de fecha (UTC → YYYYMMDD) ===== */
function two(n){ return n<10 ? "0"+n : ""+n; }
function yyyymmddUTC(d){ return d.getUTCFullYear()+two(d.getUTCMonth()+1)+two(d.getUTCDate()); }
function startOfWeekUTC(d){
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = x.getUTCDay() || 7; // ISO: lunes=1..domingo=7
  x.setUTCDate(x.getUTCDate() - (dow-1));
  return x;
}
function monthSpanUTC(d){
  const a = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const b = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 0));
  return [yyyymmddUTC(a), yyyymmddUTC(b)];
}

/* ===== Precio actual (Jupiter) ===== */
async function fetchQuote(symbol="SOL", fallback=null){
  try{
    const id = String(symbol||"SOL").toUpperCase();
    const url = `https://price.jup.ag/v6/price?ids=${encodeURIComponent(id)}`;
    const r = await fetch(url, { method:"GET", keepalive:false, cache:"no-store" });
    if (r.ok){
      const js = await r.json();
      const p = js?.data?.[id]?.price;
      if (Number.isFinite(p)) return Number(p);
    }
  }catch{}
  return (fallback==null ? null : Number(fallback));
}

/* ===== /wallet ===== */
export default function registerWallet(bot){
  bot.onText(/^\/wallet\b/i, async (msg) => {
    const uid    = String(msg.from.id);
    const chatId = msg.chat.id;
    const mode   = "DEMO"; // hoy sólo DEMO para este /wallet

    // 1) Abrir posiciones del usuario (en memoria)
    const all = bot._hxTradeInfo || {};
    const abiertos = Object.entries(all)
      .filter(([k,v]) => k.startsWith(uid+":"))
      .map(([k,v]) => v)
      .filter(v => Number(v.remUsd ?? v.amountUsdRem ?? v.amountUsd ?? 0) > 0 && Number(v.remPct ?? 100) > 0);

    // 2) Saldos (DEMO)
    const CAP   = Number(process.env.DEMO_BANK_CAP || 1000);
    const inv   = abiertos.reduce((s,v)=> s + Number(v.remUsd ?? v.amountUsdRem ?? v.amountUsd ?? 0), 0);
    const libre = Math.max(0, CAP - inv);

    // 3) Encabezado
    const header =
      "💼 <b>Billetera DEMO</b>\n" +
      "💵 <b>Libre:</b> $" + libre.toFixed(2) + "  •  " +
      "<b>Invertido:</b> $" + inv.toFixed(2) + "  •  " +
      "<b>Total:</b> $" + CAP.toFixed(2);

    // 4) Cards de abiertos con PnL no-realizado (vivo)
    const cards = [];
    for (const it of abiertos){
      const sym   = it.symbol || "SOL";
      const mint  = it.mint || "So11111111111111111111111111111111111111112";
      const entry = Number(it.entryUsd || 0);
      const remUsd= Number(it.remUsd ?? it.amountUsdRem ?? it.amountUsd ?? 0);
      const curr  = await fetchQuote(sym, entry); // fallback al entry

      const pnlPct = (entry>0 && curr!=null) ? ((curr/entry - 1)*100) : 0;
      const pnlUsd = (entry>0 && curr!=null) ? (remUsd * (curr/entry - 1)) : 0;

      const lines = [
        "🪙 <b>Token:</b> $" + sym,
        "📈 <b>Precio de entrada:</b> " + (entry ? entry.toFixed(4) : "—"),
        "📤 <b>Precio actual:</b> " + (curr!=null ? curr.toFixed(4) : "—"),
        "💵 <b>Invertido:</b> " + remUsd.toFixed(2) + " USD",
        "📈 <b>Ganancia (no realizada):</b> " + pnlPct.toFixed(2) + "% (" + pnlUsd.toFixed(2) + " USD)",
        "<a href=\"https://dexscreener.com/solana/"+mint+"\">📊 DexScreener</a>  " +
        "<a href=\"https://solscan.io/token/"+mint+"\">📎 Solscan</a>",
      ];
      cards.push(lines.join("\n"));
    }

    // 5) PnL cerradas (Supabase): hoy/semana/mes
    const now     = new Date();
    const today   = yyyymmddUTC(now);
    const weekFrom= yyyymmddUTC(startOfWeekUTC(now));
    const [mFrom, mTo] = monthSpanUTC(now);

    let sumDay={inv:0,pnl:0}, sumWeek={inv:0,pnl:0}, sumMonth={inv:0,pnl:0};
    try {
      [sumDay, sumWeek, sumMonth] = await Promise.all([
        sumClosedPnL({ mode, fromDay: today,    toDay: today }),
        sumClosedPnL({ mode, fromDay: weekFrom, toDay: today }),
        sumClosedPnL({ mode, fromDay: mFrom,    toDay: mTo    }),
      ]);
    } catch(e) {
      // si falla supa, dejamos 0s (no queremos romper /wallet)
    }
    const pct = (inv,pnl)=> inv>0 ? (pnl/inv*100) : 0;

    const footer = [
      "📈 <b>PNL (cerradas)</b>",
      `• Hoy: $${sumDay.pnl.toFixed(2)} (${pct(sumDay.inv,sumDay.pnl).toFixed(2)}%)`,
      `• Semana: $${sumWeek.pnl.toFixed(2)} (${pct(sumWeek.inv,sumWeek.pnl).toFixed(2)}%)`,
      `• Mes: $${sumMonth.pnl.toFixed(2)} (${pct(sumMonth.inv,sumMonth.pnl).toFixed(2)}%)`,
    ].join("\n");

    // 6) Mensaje final
    const body = [
      header,
      cards.length ? "📂 <b>Abiertos</b>:\n" + cards.join("\n\n") : "📂 <i>Sin abiertos</i>",
      footer,
    ].join("\n\n");

    await bot.sendMessage(chatId, body, { parse_mode:"HTML", disable_web_page_preview:true });
  });
}
