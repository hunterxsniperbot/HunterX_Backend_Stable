const fs = require('fs');
const P = 'data/state.json';
fs.mkdirSync('data', {recursive:true});
let s={}; try{s=JSON.parse(fs.readFileSync(P,'utf8'))}catch{}
s.positions=s.positions||{};
s.positions.demo=[{
  id:'demo-'+Date.now(),
  mint:'So11111111111111111111111111111111111111112',
  symbol:'SOLBOMB',
  mode:'demo',
  entryPriceUsd:0.0032,
  priceNowUsd:Number(process.env.PRICE_NOW||0), // 0 por defecto (lo podés setear con PRICE_NOW=…)
  investedUsd: Number(process.env.INVEST||1000),
  openedAt: Date.now(),
  isOpen:true
}];
const inv=s.positions.demo[0].investedUsd||0;
s.demo={cash:Number((10000-inv).toFixed(2))};
fs.writeFileSync(P,JSON.stringify(s,null,2));
console.log('✅ DEMO sembrada: inv=',inv,' priceNow=',s.positions.demo[0].priceNowUsd);
