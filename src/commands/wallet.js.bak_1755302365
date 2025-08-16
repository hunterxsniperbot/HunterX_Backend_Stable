// src/commands/wallet.js — Posiciones abiertas (HTML) + single-message refresh + Phantom
import { getOpenPositions } from '../services/positions.js';
import { getSolBalanceUSD } from '../services/phantom.js';

const BASE_DEMO = Number(process.env.BASE_DEMO || 1000);

function esc(s){
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fmtUsd(n){ return (Number(n)||0).toLocaleString('en-US',{ style:'currency', currency:'USD' }); }
function fmtPct(n){ return (Number(n)||0).toFixed(2) + '%'; }

function renderPosition(p){
  const name = esc(p.symbol || (p.mint?.slice(0,6)+'...') || 'Token');
  const entry = '📥 Precio de entrada: ' + fmtUsd(p.avgIn);
  const now   = '📤 Precio actual: '   + fmtUsd(p.priceNow);
  const inv   = '💵 Invertido: '       + fmtUsd(p.investedUsd);
  const pnl   = (p.pnlPct >= 0)
    ? `📈 PnL: +${fmtPct(p.pnlPct)} (${fmtUsd(p.pnlUsd)})`
    : `📉 PnL: ${fmtPct(p.pnlPct)} (${fmtUsd(p.pnlUsd)})`;

  let links = '';
  if (p.mint){
    const mint = esc(p.mint);
    const ds = `https://dexscreener.com/solana/${mint}`;
    const sc = `https://solscan.io/token/${mint}`;
    links = `\n<a href="${ds}">📊 DexScreener</a>  <a href="${sc}">📎 Solscan</a>`;
  }

  return [
    '',
    `🪙 <b>$${name}</b>`,
    entry,
    now,
    inv,
    pnl + links
  ].join('\n');
}

function buildHTML({ demo, real, totals }, { realUsd }){
  const header = '<b>📱 Posiciones abiertas</b>';
  const counts = [
    '',
    `- DEMO: ${totals.demoCount}`,
    `- REAL: ${totals.realCount}`,
    `- Total: ${totals.totalCount}`,
    ''
  ].join('\n');

  // Balances
  const demoInvested = totals.demoInvested;
  const realInvested = totals.realInvested;

  const demoFree = Math.max(0, BASE_DEMO - demoInvested);
  const realFree = Math.max(0, (Number(realUsd)||0) - realInvested);

  const walletReal = [
    '💳 <b>Billetera Phantom (REAL)</b>',
    '- Address: ' + esc(process.env.PHANTOM_ADDRESS || '—'),
    '- Invertido: ' + fmtUsd(realInvested),
    '- Libre para sniper: ' + fmtUsd(realFree),
    '- Total disponible: ' + fmtUsd((Number(realUsd)||0)),
    ''
  ].join('\n');

  const walletDemo = [
    '🧪 <b>Billetera DEMO</b>',
    '- Invertido: ' + fmtUsd(demoInvested),
    '- Libre para sniper: ' + fmtUsd(demoFree),
    '- Total disponible: ' + fmtUsd(demoFree + demoInvested),
    ''
  ].join('\n');

  const combined = [...real, ...demo]
    .sort((a,b)=>Math.abs(b.pnlUsd) - Math.abs(a.pnlUsd))
    .slice(0, 10)
    .map(renderPosition)
    .join('\n');

  return [
    header,
    counts,
    walletReal,
    walletDemo,
    combined || '—'
  ].join('\n');
}

export default function registerWallet(bot){
  // Por usuario guardamos: { interval, chatId, messageId, running, baseMs }
  bot._walletLoop = bot._walletLoop || {};

  bot.onText(/^\s*\/wallet(?:\s+(\S+))?\s*$/i, async (msg, m) => {
    const chatId = msg.chat.id;
    const uid    = String(msg.from.id);
    const arg    = (m && m[1]) ? String(m[1]).toLowerCase() : '';

    // STOP
    if (arg === 'stop'){
      const loop = bot._walletLoop[uid];
      if (loop?.interval) clearInterval(loop.interval);
      delete bot._walletLoop[uid];
      return bot.sendMessage(chatId, '<b>⏹️ Wallet: loop detenido</b>', { parse_mode:'HTML' });
    }

    // ONCE
    const isOnce = (arg === 'once');

    // base segundos
    let baseSec = 10;
    if (!isOnce && /^\d+(\.\d+)?$/.test(arg)) baseSec = Math.max(3, Number(arg));
    const baseMs = baseSec * 1000;

    // función de render (edita mensaje si existe)
    const renderOnce = async () => {
      const loop = bot._walletLoop[uid] || {};
      if (loop.running) return; // anti-reentrancia
      loop.running = true;
      bot._walletLoop[uid] = loop;
      try{
        const data = await getOpenPositions();
        const realUsd = await getSolBalanceUSD(process.env.PHANTOM_ADDRESS || '');
        const html = buildHTML(data, { realUsd });

        if (!loop.messageId){
          // primera vez: enviar
          const sent = await bot.sendMessage(chatId, html, { parse_mode:'HTML', disable_web_page_preview:true });
          loop.chatId = chatId;
          loop.messageId = sent.message_id;
        }else{
          // refrescar: editar
          try{
            await bot.editMessageText(html, {
              chat_id: loop.chatId,
              message_id: loop.messageId,
              parse_mode:'HTML',
              disable_web_page_preview:true
            });
          }catch(e){
            // si el texto no cambió, Telegram tira 400 "message is not modified"
            // lo ignoramos para no romper el loop
            // cualquier otro error lo logueamos
            const msg = (e && e.message) || String(e||'');
            if (!/message is not modified/i.test(msg)) {
              console.warn('[wallet.edit]', msg);
            }
          }
        }
      }finally{
        const L = bot._walletLoop[uid] || {};
        L.running = false;
        bot._walletLoop[uid] = L;
      }
    };

    if (isOnce){
      // una sola “foto”
      return renderOnce();
    }

    // loop: limpiar previo si existía
    const prev = bot._walletLoop[uid];
    if (prev?.interval) clearInterval(prev.interval);
    bot._walletLoop[uid] = { ...prev, chatId, messageId: prev?.messageId, running:false, baseMs };

    // disparo inmediato + intervalo
    await renderOnce();
    const loopRef = setInterval(renderOnce, baseMs);
    bot._walletLoop[uid].interval = loopRef;
  });

  console.log('✅ Handler cargado: wallet.js (HTML + single edit loop + Phantom)');
}
