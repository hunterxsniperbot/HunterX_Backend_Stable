export function esc(s=''){ return String(s).replace(/[<&>]/g, m=>({ '<':'&lt;','&':'&amp;','>':'&gt;' }[m])); }

function linkPack(symbol){
  const sym = String(symbol||'').toUpperCase().trim();
  const solMint = 'So11111111111111111111111111111111111111112';
  if (sym === 'SOL'){
    return {
      dexscreener_url: 'https://dexscreener.com/solana',
      jupiter_url:     'https://jup.ag/swap/SOL-USDC',
      raydium_url:     'https://raydium.io/swap/?from=SOL&to=USDC',
      birdeye_url:     'https://birdeye.so/token/SOL?chain=solana',
      solscan_url:     `https://solscan.io/token/${solMint}`,
    };
  }
  const q = encodeURIComponent(sym);
  return {
    dexscreener_url: `https://dexscreener.com/solana?query=${q}`,
    jupiter_url:     `https://jup.ag/swap/${q}-USDC`,
    raydium_url:     `https://raydium.io/swap/?from=${q}&to=USDC`,
    birdeye_url:     `https://birdeye.so/search?query=${q}&chain=solana`,
    solscan_url:     `https://solscan.io/search?query=${q}`,
  };
}

export function tmplBuyExecuted(d){
  const L = linkPack(d.symbol);
  return [
    '✅ <b>COMPRA AUTOMÁTICA EJECUTADA ('+esc(d.MODO)+')</b>',
    '',
    '🧾 <b>Trade ID:</b> #'+esc(d.trade_id)+' • Modo: '+esc(d.MODO),
    '🪙 <b>Token:</b> $'+esc(d.symbol)+' ('+esc(d.mint_short)+')',
    '🔗 <b>Ruta:</b> '+esc(d.route)+' • <b>Slippage:</b> '+esc(d.slippage_bps)+' bps • <b>Fees/Gas:</b> '+esc(d.fees_usd),
    '💵 <b>Invertido:</b> '+esc(d.size_usd)+' USD ('+esc(d.size_sol)+' SOL)',
    '🎯 <b>Entrada:</b> '+esc(d.entry_price_usd)+' USD',
    '📊 <b>buy_score:</b> '+esc(d.buy_score_pct)+' (T1 '+esc(d.T1)+') • <b>scam_score:</b> '+esc(d.scam_score_pct)+' (scam_t1 '+esc(d.scam_t1)+')',
    '🛡️ <b>Guardas:</b> Honeypot '+esc(d.honeypot_emoji)+' • LiqLocked '+esc(d.liq_locked_emoji)+' • Renounced '+esc(d.renounced_emoji)+' • Stale '+esc(d.stale_emoji),
    '📈 <b>TP/SL:</b> TP '+esc(d.tp_pct)+' • SL '+esc(d.sl_pct)+' • Cooldown: '+esc(d.cooldown_s)+' s',
    '⏱️ <b>Hora:</b> '+esc(d.ts_local),
    '',
    '<b>Enlaces rápidos</b> <a href="'+esc(L.dexscreener_url)+'">DexScreener</a> | <a href="'+esc(L.jupiter_url)+'">Jupiter</a> | <a href="'+esc(L.raydium_url)+'">Raydium</a> | <a href="'+esc(L.birdeye_url)+'">Birdeye</a> | <a href="'+esc(L.solscan_url)+'">Solscan</a>'
  ].join('\n');
}

export function tmplSellExecuted(d){
  const L = linkPack(d.symbol);
  return [
    '✂️ <b>VENTA '+esc(d.kind||'')+' EJECUTADA ('+esc(d.MODO)+')</b>',
    '',
    '🧾 <b>Trade ID:</b> #'+esc(d.trade_id)+' • <b>Token:</b> $'+esc(d.symbol),
    '💵 <b>Vendido:</b> '+esc(d.sold_usd)+' USD ('+esc(d.sold_pct)+'%) • <b>Queda:</b> '+esc(d.remain_usd)+' USD ('+esc(d.remain_pct)+'%)',
    '📤 <b>Salida:</b> '+esc(d.exit_price_usd)+' USD • <b>Prom. Salida:</b> '+esc(d.avg_exit_price_usd||'-'),
    '📈 <b>PnL realizado:</b> '+esc(d.realized_pnl_usd)+' USD ('+esc(d.realized_pnl_pct)+')',
    '📊 <b>PnL no realizado:</b> '+esc(d.unreal_pnl_usd)+' USD ('+esc(d.unreal_pnl_pct)+')',
    '⏱️ <b>Tiempo en trade:</b> '+esc(d.hold_time)+' • <b>Hora:</b> '+esc(d.ts_local),
    '',
    '<b>Enlaces rápidos</b> <a href="'+esc(L.dexscreener_url)+'">DexScreener</a> | <a href="'+esc(L.jupiter_url)+'">Jupiter</a> | <a href="'+esc(L.raydium_url)+'">Raydium</a> | <a href="'+esc(L.birdeye_url)+'">Birdeye</a> | <a href="'+esc(L.solscan_url)+'">Solscan</a>'
  ].join('\n');
}

export function kbTradeDefault(tradeId){
  return {
    inline_keyboard: [
      [{ text: '📊 PnL', callback_data: `pnl:${tradeId}` }],
      [
        { text: '🔁 25%', callback_data: `sell:${tradeId}:25` },
        { text: '🔁 50%', callback_data: `sell:${tradeId}:50` },
        { text: '🔁 75%', callback_data: `sell:${tradeId}:75` },
        { text: '💯',     callback_data: `sell:${tradeId}:100` }
      ]
    ]
  };
}
