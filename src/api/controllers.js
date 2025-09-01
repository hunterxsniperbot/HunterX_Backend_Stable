import { getState } from '../services/demoBank.js';
import { getFlags, setFlags } from '../services/flags.js';
import { ensureLoopRunning, stopLoop, isRunning } from '../loops/autoSniperLoop.js';

const PER_CHECK_MS = Number(process.env.SALUD_TIMEOUT_MS || 1200);
const DEADLINE_MS  = Number(process.env.SALUD_DEADLINE_MS || 2000);
const now = () => Date.now();

function withTimeout(promise, ms, fallback) {
  return new Promise((resolve) => {
    const to = setTimeout(() => resolve(fallback), ms);
    promise.then(v => { clearTimeout(to); resolve(v); })
           .catch(() => { clearTimeout(to); resolve(fallback); });
  });
}
async function timedFetch(url, { method='GET', headers={}, body=null } = {}) {
  const started = now();
  try { const r = await fetch(url, { method, headers, body });
    return { ok:r.ok, status:r.status??null, latency_ms: now()-started };
  } catch (e){ return { ok:false, status:null, latency_ms: now()-started, error:String(e?.message||e) }; }
}
function shape(name, group, res){
  return { name, group, status: res.ok?'OK':'DOWN', http:res.status??null,
    latency_ms:res.latency_ms??null, p50_ms:res.latency_ms??null, p95_ms:res.latency_ms??null,
    timeout_pct: (!res.ok && res.error==='timeout') ? 100 : 0, error: res.ok?undefined:res.error };
}
async function checkRPC(name, url){
  if (!url) return { name, group:'infra', status:'CONFIG', p50_ms:null, p95_ms:null, timeout_pct:0 };
  const body = JSON.stringify({ jsonrpc:'2.0', id:1, method:'getSlot' });
  const res  = await withTimeout(timedFetch(url, { method:'POST', headers:{'content-type':'application/json'}, body }),
    PER_CHECK_MS, { ok:false, status:null, latency_ms:PER_CHECK_MS+1, error:'timeout' });
  return shape(name, 'infra', res);
}
async function checkHTTP(name, url){
  const res = await withTimeout(timedFetch(url), PER_CHECK_MS,
    { ok:false, status:null, latency_ms:PER_CHECK_MS+1, error:'timeout' });
  return shape(name, 'data', res);
}

export async function getHealthSnapshot(q = {}){
  const flags = await getFlags();
  const fast = q.fast === '1' || q.fast === 1 || q.fast === true;

  const infraStatic = [
    { name:'TG mode', group:'infra', label:'POLLING', status: process.env.TELEGRAM_BOT_TOKEN?'OK':'DISABLED', p50_ms:null, p95_ms:null, timeout_pct:0 },
    { name:'Phantom', group:'infra', status:(process.env.PHANTOM_ADDRESS||process.env.PHANTOM_PUBLIC_KEY||process.env.PHANTOM_PK)?'OK':'CONFIG', p50_ms:null, p95_ms:null, timeout_pct:0 },
  ];

  if (fast){
    const st = getState();
    const score = infraStatic.filter(x=>x.status==='OK').length / infraStatic.length * 100 | 0;
    return { ok:true, ts:now(), mode: flags.mode.toLowerCase(), autosniper: flags.autosniper,
      refreshMs: Number(process.env.SALUD_REFRESH_MS||12000), score, infra:infraStatic, data:[],
      balances:{ demo:{investedUsd:st.invested,cashUsd:st.cash,totalUsd:st.total}, real:{investedUsd:0,cashUsd:0,totalUsd:0} } };
  }

  const tasks = [];
  if (process.env.HELIUS_RPC_URL)  tasks.push(checkRPC('Helius',    process.env.HELIUS_RPC_URL));
  if (process.env.QUICKNODE_URL)   tasks.push(checkRPC('QuickNode', process.env.QUICKNODE_URL));
  tasks.push(checkHTTP('DexScreener','https://api.dexscreener.com/ping'));
  tasks.push(checkHTTP('CoinGecko',  'https://api.coingecko.com/api/v3/ping'));

  const deadline = new Promise(r => setTimeout(()=>r('DEADLINE'), DEADLINE_MS));
  const results  = await Promise.race([ Promise.allSettled(tasks), deadline ]);

  let infra = [...infraStatic], data = [];
  if (results !== 'DEADLINE'){
    const vals = results.map(r => r.status==='fulfilled' ? r.value : null).filter(Boolean);
    for (const v of vals){ if (v.group==='infra') infra.push(v); else data.push(v); }
  } else {
    data = [
      { name:'DexScreener', group:'data', status:'DOWN', http:null, latency_ms:DEADLINE_MS, timeout_pct:100, error:'deadline' },
      { name:'CoinGecko',   group:'data', status:'DOWN', http:null, latency_ms:DEADLINE_MS, timeout_pct:100, error:'deadline' },
    ];
  }

  const st = getState();
  const all = [...infra, ...data];
  const okCount = all.filter(x=>x.status==='OK').length;
  const score = Math.round((okCount / Math.max(1, all.length)) * 100);

  return { ok:true, ts:now(), mode: flags.mode.toLowerCase(), autosniper: flags.autosniper,
    refreshMs: Number(process.env.SALUD_REFRESH_MS||12000), score, infra, data,
    balances:{ demo:{investedUsd:st.invested,cashUsd:st.cash,totalUsd:st.total}, real:{investedUsd:0,cashUsd:0,totalUsd:0} } };
}

export async function startAutoSniper(mode='DEMO'){
  const next = await setFlags({ mode: (mode==='REAL'?'REAL':'DEMO'), autosniper: true });
  ensureLoopRunning();
  return { ok:true, ...next, running: isRunning() };
}
export async function stopAutoSniper(){
  const next = await setFlags({ autosniper: false });
  stopLoop();
  return { ok:true, ...next, running: isRunning() };
}
export async function getWalletSummary(){
  const flags = await getFlags();
  const s = getState(); // TODO: en REAL, leer tu wallet real
  return { ok:true, mode: flags.mode, autosniper: flags.autosniper, running: isRunning(), ...s };
}
