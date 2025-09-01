import { getFlags } from '../services/flags.js';

const TICK_MS = Number(process.env.SNIPER_TICK_MS || 1500);
let timer = null;
let tickCount = 0;

async function runScanTick(){
  // 🔴 Aquí luego llamamos a tu lógica real (ej: markets.preScan()/route/exec).
  // Por ahora, solo trazamos que el loop corre:
  const f = await getFlags();
  if (!f.autosniper) return; // safety
  tickCount++;
  if (tickCount % 10 === 1) {
    console.log(`⏱️  AutoSniper tick #${tickCount} [mode=${f.mode}]`);
  }
}

export function ensureLoopRunning(){
  if (timer) return;
  timer = setInterval(() => {
    runScanTick().catch(e => console.error('AutoSniper tick error:', e?.message||e));
  }, TICK_MS);
  console.log(`▶️  AutoSniper loop started (interval=${TICK_MS}ms)`);
}

export function stopLoop(){
  if (timer) {
    clearInterval(timer);
    timer = null;
    console.log('⏹️  AutoSniper loop stopped');
  }
}

export function isRunning(){ return !!timer; }
