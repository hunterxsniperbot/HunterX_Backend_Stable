import { getJson, postJson, sleep, scoreFrom } from './health_common.js';

const RETRY = Math.max(0, Number(process.env.HEALTH_RETRY || 1));
const TIMEOUT = Number(process.env.HEALTH_TIMEOUT_MS || 1200);

// wrappers con retry
async function withRetry(fn){
  let last;
  for (let i=0;i<=RETRY;i++){
    try { return await fn(); } catch(e){ last=e; if (i<RETRY) await sleep(100+Math.random()*100); }
  }
  throw last;
}

/* ───────── Infra ───────── */
export async function checkTelegramMode(){
  // estás en polling hoy
  return { name:'TG mode', group:'infra', label:'POLLING', status:'OK' };
}

export async function checkQuickNode(){
  const url = process.env.QUICKNODE_URL;
  if (!url) return { name:'QuickNode', group:'infra', status:'CONFIG' };
  try {
    const r = await withRetry(()=>postJson(url, {jsonrpc:'2.0',id:1,method:'getSlot'}));
    const status = r.ok ? 'OK' : (r.status===429||r.status===401 ? 'DEGRADED' : 'DOWN');
    return { name:'QuickNode', group:'infra', status, latency_ms:r.dt, http:r.status };
  } catch(e){
    return { name:'QuickNode', group:'infra', status:'DOWN', reason:String(e?.message||e) };
  }
}

export async function checkPhantom(){
  // en backend no hay handshake con Phantom; marcamos CONFIG si no hay address
  const addr = process.env.PHANTOM_PUBLIC_KEY || process.env.PHANTOM_ADDRESS;
  return { name:'Phantom', group:'infra', status: addr ? 'OK' : 'CONFIG' };
}

export async function checkSheets(){
  const id = process.env.GOOGLE_SHEETS_ID;
  return { name:'Google Sheets', group:'infra', status: id ? 'OK' : 'CONFIG' };
}

export async function checkRender(){
  // cuando corras en Render, podés setear una env FLAG tipo RENDER=1
  const on = process.env.RENDER || '';
  return { name:'Render', group:'infra', status: on ? 'OK' : 'DOWN' };
}

/* ───────── Data sources ───────── */
export async function checkDexscreener(){
  try{
    const r = await withRetry(()=>getJson('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112', TIMEOUT));
    const status = r.ok ? 'OK' : 'DOWN';
    return { name:'DexScreener', group:'data', status, latency_ms:r.dt, http:r.status };
  }catch(e){
    return { name:'DexScreener', group:'data', status:'DOWN', reason:String(e?.message||e) };
  }
}

export async function checkBirdeye(){
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return { name:'Birdeye', group:'data', status:'CONFIG' };
  try{
    const r = await withRetry(()=>getJson('https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112&chain=solana', TIMEOUT, { 'x-api-key': key }));
    const status = r.ok ? 'OK' : (r.status===429||r.status===401 ? 'DEGRADED' : 'DOWN');
    return { name:'Birdeye', group:'data', status, latency_ms:r.dt, http:r.status };
  }catch(e){
    return { name:'Birdeye', group:'data', status:'DOWN', reason:String(e?.message||e) };
  }
}

export async function checkTokenSniffer(){
  // generalmente requiere plan/clave y no cubre Solana; lo marcamos CONFIG si no hay key
  const key = process.env.TOKENSNIFFER_API_KEY || '';
  return { name:'TokenSniffer', group:'data', status: key ? 'CONFIG' : 'CONFIG' };
}

export async function checkGoPlus(){
  const key = process.env.GOPLUS_API_KEY;
  if (!key) return { name:'GoPlus', group:'data', status:'CONFIG' };
  try{
    const url = (process.env.GOPLUS_PING_URL || 'https://api.gopluslabs.io/api/v1/chain_list') + '?api_key=' + encodeURIComponent(key);
    const r = await withRetry(()=>getJson(url, TIMEOUT));
    const status = r.ok ? 'OK' : (r.status===429||r.status===401 ? 'DEGRADED' : 'DOWN');
    return { name:'GoPlus', group:'data', status, latency_ms:r.dt, http:r.status };
  }catch(e){
    return { name:'GoPlus', group:'data', status:'DOWN', reason:String(e?.message||e) };
  }
}

export async function checkWhaleAlert(){
  const key = process.env.WHALE_ALERT_API_KEY;
  if (!key) return { name:'Whale Alert', group:'data', status:'CONFIG' };
  try{
    const r = await withRetry(()=>getJson('https://api.whale-alert.io/v1/status?api_key='+encodeURIComponent(key), TIMEOUT));
    const status = r.ok ? 'OK' : (r.status===429||r.status===401 ? 'DEGRADED' : 'DOWN');
    return { name:'Whale Alert', group:'data', status, latency_ms:r.dt, http:r.status };
  }catch(e){
    return { name:'Whale Alert', group:'data', status:'DOWN', reason:String(e?.message||e) };
  }
}

export async function checkTensorflow(){
  // sólo señalizamos si la lib está disponible
  try{
    // intenta cargar tfjs (ligero). tfjs-node puede no estar.
    await withRetry(()=>import('@tensorflow/tfjs'));
    return { name:'TensorFlow IA', group:'data', status:'OK' };
  }catch{
    return { name:'TensorFlow IA', group:'data', status:'CONFIG' };
  }
}

export async function checkSolscan(){
  try{
    const r = await withRetry(()=>getJson('https://api.solscan.io/chaininfo', TIMEOUT));
    const status = r.ok ? 'OK' : 'DOWN';
    return { name:'Solscan', group:'data', status, latency_ms:r.dt, http:r.status };
  }catch(e){
    return { name:'Solscan', group:'data', status:'DOWN', reason:String(e?.message||e) };
  }
}

export async function checkJupiter(){
  try{
    const r = await withRetry(()=>getJson('https://price.jup.ag/v4/price?ids=SOL', TIMEOUT));
    const status = r.ok ? 'OK' : 'DOWN';
    return { name:'Jupiter', group:'data', status, latency_ms:r.dt, http:r.status };
  }catch(e){
    return { name:'Jupiter', group:'data', status:'DOWN', reason:String(e?.message||e) };
  }
}

export async function checkRaydium(){
  try{
    const r = await withRetry(()=>getJson('https://api.raydium.io/pairs?limit=1', TIMEOUT));
    const status = r.ok ? 'OK' : 'DOWN';
    return { name:'Raydium', group:'data', status, latency_ms:r.dt, http:r.status };
  }catch(e){
    return { name:'Raydium', group:'data', status:'DOWN', reason:String(e?.message||e) };
  }
}

export async function checkCoingecko(){
  try{
    const r = await withRetry(()=>getJson('https://api.coingecko.com/api/v3/ping', TIMEOUT));
    const status = r.ok ? 'OK' : 'DOWN';
    return { name:'CoinGecko', group:'data', status, latency_ms:r.dt, http:r.status };
  }catch(e){
    return { name:'CoinGecko', group:'data', status:'DOWN', reason:String(e?.message||e) };
  }
}

export async function checkCMC(){
  const key = process.env.CMC_API_KEY;
  if (!key) return { name:'CoinMarketCap', group:'data', status:'CONFIG' };
  try{
    const r = await withRetry(()=>getJson('https://pro-api.coinmarketcap.com/v1/cryptocurrency/map?limit=1', TIMEOUT, { 'X-CMC_PRO_API_KEY': key }));
    const status = r.ok ? 'OK' : (r.status===429||r.status===401 ? 'DEGRADED' : 'DOWN');
    return { name:'CoinMarketCap', group:'data', status, latency_ms:r.dt, http:r.status };
  }catch(e){
    return { name:'CoinMarketCap', group:'data', status:'DOWN', reason:String(e?.message||e) };
  }
}

export async function checkDiscord(){
  // si tenés webhook lo marcamos OK (no posteamos para no spamear)
  const wh = process.env.DISCORD_WEBHOOK_URL;
  return { name:'Discord', group:'data', status: wh ? 'OK' : 'CONFIG' };
}

/* ───────── agregador + render ───────── */
export async function runAllChecks(){
  const checks = [
    // infra
    checkTelegramMode, checkQuickNode, checkPhantom, checkSheets, checkRender,
    // data
    checkDexscreener, checkBirdeye, checkTokenSniffer, checkGoPlus, checkWhaleAlert,
    checkTensorflow, checkSolscan, checkJupiter, checkRaydium, checkCoingecko, checkCMC, checkDiscord
  ];
  const results = [];
  for (const fn of checks){
    try { results.push(await fn()); }
    catch(e){ results.push({ name: fn.name, status:'DOWN', reason:String(e?.message||e) }); }
  }
  return results;
}

export function formatSummary(results){
  const toIcon = (s)=> s==='OK' ? '✅' : s==='DEGRADED' ? '🟠' : s==='CONFIG' || s==='SKIPPED' ? '➖' : '❌';

  const infra = results.filter(r=>r.group==='infra');
  const data  = results.filter(r=>r.group==='data');

  // score: sólo servicios evaluables (OK/DOWN/DEGRADED)
  const evals = results.filter(r=>['OK','DOWN','DEGRADED'].includes(r.status));
  const got = evals.reduce((a,r)=> a + scoreFrom(r.status, r.latency_ms), 0);
  const den = evals.length || 1;
  const pct = got/den;
  const sem = (pct>=0.90)?'🟢':(pct>=0.60)?'🟡':'🔴';

  const line = (r)=> {
    const base = `• ${r.name}: ${toIcon(r.status)}`;
    const extra = [];
    if (r.label) extra.push(r.label);
    if (typeof r.latency_ms==='number') extra.push(`${r.latency_ms}ms`);
    if (typeof r.http==='number') extra.push(`HTTP ${r.http}`);
    if (r.reason && r.status!=='OK') extra.push(r.reason);
    return extra.length ? `${base} (${extra.join(' · ')})` : base;
  };

  const infraTxt = infra.map(line).join('\n');
  const dataTxt  = data.map(line).join('\n');

  const header = `**🛰️ Conexiones activas**\n\n` +
    `Semáforo global: ${sem}  • Score: ${got.toFixed(1)}/${den} (${Math.round(pct*100)}%)\n\n` +
    `**Infraestructura**\n${infraTxt}\n\n` +
    `**Fuentes de datos**\n${dataTxt}`;

  return header;
}
