let cash = 1000;               // saldo inicial DEMO en USD
let positions = [];            // [{ token, qty, priceIn, amountUsd, ts }]
let closed = [];               // [{ token, pnlUsd, reason, ts }]
const now = ()=> new Date().toISOString();

export function getState(){
  const invested = positions.reduce((a,p)=> a + p.amountUsd, 0);
  const total = cash + invested;
  return { cash, invested, total, positions, closed };
}

export function resetDemoBank(usdc = 1000){
  cash = usdc; positions = []; closed = [];
}

export function buyDemo({ token='SOL', amountUsd=20, priceUsd=100 }={}){
  if (amountUsd <= 0) throw new Error('amountUsd inválido');
  if (cash < amountUsd) throw new Error('Saldo insuficiente DEMO');
  const qty = amountUsd / priceUsd;
  cash -= amountUsd;
  const pos = { token, qty, priceIn: priceUsd, amountUsd, ts: now() };
  positions.push(pos);
  return pos;
}

export function sellAllDemo({ token, priceUsd, reason='manual' }){
  const keep = []; let realized = 0;
  for (const p of positions){
    if (p.token !== token){ keep.push(p); continue; }
    const pnl = (priceUsd - p.priceIn) * p.qty; // USD
    realized += pnl + p.amountUsd;              // recupera principal + pnl
    closed.push({ token, pnlUsd: pnl, reason, ts: now() });
  }
  positions = keep;
  cash += realized;
  return { realizedUsd: realized };
}
