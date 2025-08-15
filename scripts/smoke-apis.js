const which = process.argv[2];

async function checkSheets() {
  try {
    const mod = await import('../src/services/sheets.js');
    const demo = process.env.SHEETS_TAB_DEMO || 'DEMO';
    const real = process.env.SHEETS_TAB_REAL || 'REAL';
    const a = await mod.readRows(demo);
    let b = [];
    try { b = await mod.readRows(real); } catch { b = []; }
    console.log(`SHEETS DEMO=${a.length} REAL=${b.length}`);
    return true;
  } catch (e) {
    console.error('Sheets error:', e?.response?.status || '', e?.message || e);
    return false;
  }
}

async function checkPrices() {
  try {
    const p = await import('../src/services/prices.js');
    const WSOL = 'So11111111111111111111111111111111111111112';
    const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const sol = await p.getPriceUSD(WSOL).catch(() => null);
    const usd = await p.getPriceUSD(USDC).catch(() => null);
    if (!sol || typeof sol.price !== 'number') throw new Error('WSOL sin precio válido');
    if (!usd || typeof usd.price !== 'number' || Math.abs(usd.price - 1) > 0.01) throw new Error('USDC no ≈ 1.0');
    console.log('PRICES WSOL=', sol, 'USDC=', usd);
    return true;
  } catch (e) {
    console.error('Prices error:', e?.message || e);
    return false;
  }
}

async function checkPhantom() {
  try {
    const nacl = await import('tweetnacl');
    const { PublicKey } = await import('@solana/web3.js');
    if (!process.env.PHANTOM_PRIVATE_KEY) throw new Error('PHANTOM_PRIVATE_KEY vacío');
    const arr = JSON.parse(process.env.PHANTOM_PRIVATE_KEY);
    if (!Array.isArray(arr) || arr.length < 64) throw new Error('PHANTOM_PRIVATE_KEY formato inválido (esperado JSON array Uint8Array)');
    const kp = nacl.default.sign.keyPair.fromSecretKey(Uint8Array.from(arr));
    const pub = new PublicKey(kp.publicKey).toBase58();
    const envPub = process.env.PHANTOM_ADDRESS || '(sin)';
    console.log('PHANTOM pub   =', pub);
    console.log('PHANTOM .env  =', envPub);
    if (envPub !== '(sin)' && envPub !== pub) console.log('AVISO: PHANTOM_ADDRESS difiere de la derivada (revisar .env)');
    return true;
  } catch (e) {
    console.error('Phantom error:', e?.message || e);
    return false;
  }
}

(async () => {
  let ok = false;
  if (which === 'sheets') ok = await checkSheets();
  else if (which === 'prices') ok = await checkPrices();
  else if (which === 'phantom') ok = await checkPhantom();
  else { console.error('Uso: node scripts/smoke-apis.js <sheets|prices|phantom>'); process.exit(2); }
  process.exit(ok ? 0 : 1);
})();
