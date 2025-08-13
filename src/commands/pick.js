// src/commands/pick.js — Compra DEMO con ruta Jupiter (simulada)
// /pick SOL/USDC 25 0.8   | /pick SOL  (por defecto 10 USD, 0.8% slippage)
import * as sheets from '../services/sheets.js';
import { TAB_DEMO, TAB_REAL } from '../services/tabs.js';
import { getPriceUSD } from '../services/prices.js';

function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const fmtUSD=(n)=>'$'+(Number(n||0)).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const USDC_MINT='EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT ='So11111111111111111111111111111111111111112';

const WELLKNOWN = {
  'USDC': USDC_MINT,
  'SOL' : SOL_MINT
};

// DexScreener para resolver mint de símbolo desconocido (Solana)
async function resolveMintFromSymbol(sym){
  const s = (sym||'').toUpperCase();
  if (WELLKNOWN[s]) return WELLKNOWN[s];
  try{
    const res = await fetch(`https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(s)}`);
    const j   = await res.json();
    const pairs = j?.pairs || [];
    const cand = pairs.find(p => (p.chainId||'').toLowerCase()==='solana');
    const mint = cand?.baseToken?.symbol?.toUpperCase() === s ? cand?.baseToken?.address
               : cand?.quoteToken?.symbol?.toUpperCase()=== s ? cand?.quoteToken?.address
               : cand?.baseToken?.address;
    return mint || null;
  }catch{ return null; }
}

// Jupiter quote (input USDC -> output TOKEN)
async function jupQuote({ outMint, usdAmount, slippagePct }){
  try{
    const amount = Math.round(Number(usdAmount||10) * 1e6); // USDC 6 dec
    const bps    = Math.round(Number(slippagePct||0.8) * 100);
    const url    = `https://quote-api.jup.ag/v6/quote?inputMint=${USDC_MINT}&outputMint=${outMint}&amount=${amount}&slippageBps=${bps}`;
    const j = await (await fetch(url)).json();
    // Tomamos la mejor ruta
    const route = Array.isArray(j?.data) ? j.data[0] : null;
    if (!route) return null;
    const outAmt = Number(route.outAmount||0);     // en minor units del token
    const outDec = Number(route.outDecimals||9) || 9;
    const outQty = outAmt / (10**outDec);
    // dex label (si existe)
    const label  = route?.routePlan?.[0]?.swapInfo?.label || route?.routePlan?.[0]?.swapInfo?.ammKey || 'JupiterRoute';
    return { outQty, label, priceUsd: outQty>0 ? (Number(usdAmount||10)/outQty) : null };
  }catch{ return null; }
}

export default function registerPick(bot){
  bot.onText(/^\s*\/pick(?:\s+([A-Za-z0-9/_-]+))?(?:\s+([\d.]+))?(?:\s+([\d.]+))?\s*$/i,
  async (msg, m)=>{
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);
    const pairRaw= (m && m[1]) ? String(m[1]).toUpperCase() : 'SOL/USDC';
    const amount = Number(m?.[2] || 10);       // USD
    const slip   = Number(m?.[3] || 0.8);      // %
    const isReal = !!bot.realMode?.[uid];
    const mode   = isReal ? 'REAL' : 'DEMO';

    // Parse par
    let [base, quote] = pairRaw.includes('/') ? pairRaw.split('/') : [pairRaw,'USDC'];
    base  = (base||'').trim().toUpperCase();
    quote = (quote||'').trim().toUpperCase();

    // Solo soportamos comprar con USDC por ahora (USDC->TOKEN)
    if (quote !== 'USDC'){
      return bot.sendMessage(chatId, '⚠️ <b>Por ahora solo USDC como quote</b> (ej: <code>/pick SOL/USDC 25 0.8</code>)', { parse_mode:'HTML' });
    }

    // Resolver mint del token base
    const mint = await resolveMintFromSymbol(base);
    if (!mint){
      return bot.sendMessage(chatId, '⚠️ No pude resolver el mint de <b>'+esc(base)+'</b>', { parse_mode:'HTML' });
    }

    // Intentamos Jupiter quote
    let route = await jupQuote({ outMint: mint, usdAmount: amount, slippagePct: slip });

    // Fallback: agregador de precios
    if (!route || !route.outQty || !route.priceUsd){
      const p = await getPriceUSD({ symbol: base });
      if (!p) return bot.sendMessage(chatId, '⚠️ No pude cotizar '+esc(base), { parse_mode:'HTML' });
      const qty = amount / p;
      route = { outQty: qty, label:'PricesAggregator', priceUsd: p };
    }

    const entry = route.priceUsd || (amount / route.outQty);
    const html  = [
      '🧪 <b>Pick '+esc(base)+'</b> ('+mode+')',
      '• Monto: <b>'+fmtUSD(amount)+'</b> USDC',
      '• Slippage: <b>'+slip+'%</b>',
      '• Ruta: <code>'+esc(route.label||'JupiterRoute')+'</code>',
      '• Qty estimada: <b>'+route.outQty.toFixed(6)+'</b> '+esc(base),
      '• Precio estimado: <b>'+fmtUSD(entry)+'</b> por '+esc(base),
    ].join('\n');

    // Si DEMO -> escribimos OPEN a Sheets
    if (!isReal){
      const now = new Date().toISOString();
      const row = {
        SYMBOL: base,
        STATUS: 'OPEN',
        ENTRY: entry,
        QTY: route.outQty,
        INVESTED: amount,
        CHAIN: 'solana',
        WHEN: now,
        NOTE: 'pick demo (jup/fallback)'
      };
      try{
        await sheets.appendRow(TAB_DEMO, row);
      }catch(e){
        return bot.sendMessage(chatId, html+'\n\n⚠️ <i>No pude registrar en DEMO: '+esc(e.message||e)+'</i>', { parse_mode:'HTML' });
      }
      return bot.sendMessage(chatId, html+'\n\n✅ Registrado en DEMO (OPEN)', { parse_mode:'HTML' });
    }

    // REAL (no ejecutamos trade real todavía)
    return bot.sendMessage(chatId, html+'\n\nℹ️ Modo REAL: mostrando ruta, sin ejecutar (aún).', { parse_mode:'HTML' });
  });

  console.log('✅ Handler cargado: pick.js');
}
