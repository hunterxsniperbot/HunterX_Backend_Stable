import { getFlags } from '../services/flags.js';
import { demoScanTick } from '../orchestrators/sniperDemo.js';

const TICK_MS = Number(process.env.SNIPER_TICK_MS || 1500);
let timer = null;
let tickCount = 0;

async function runScanTick(){
  const f = await getFlags();
  if (!f.autosniper) return;
  tickCount++;

  if (f.mode === 'DEMO'){
    await demoScanTick(tickCount % 5 === 1); // log cada ~5 ticks
  } else {
    // TODO M4bis/M5: aquí enchufarás tu autoSniper REAL (Phantom/Jupiter)
    if (tickCount % 20 === 1) console.log('⏳ REAL mode placeholder tick…');
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
  if (timer){
    clearInterval(timer);
    timer = null;
    console.log('⏹️  AutoSniper loop stopped');
  }
}

export function isRunning(){ return !!timer; }
