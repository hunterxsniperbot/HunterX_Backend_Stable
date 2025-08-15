(async () => {
  try {
    const { getPriceUSD } = await import('../services/prices.js');
    const SOL = 'So11111111111111111111111111111111111111112';
    const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    getPriceUSD(SOL).catch(()=>{});
    getPriceUSD(USDC).catch(()=>{});
  } catch {}
  try {
    const s = await import('../services/sheets.js');
    const tab = process.env.SHEETS_TAB_DEMO || 'DEMO';
    s.readRows?.(tab).catch(()=>{});
  } catch {}
  try {
    const x = await import('../services/supabase.js');
    x.ping?.().catch(()=>{});
  } catch {}
})();
