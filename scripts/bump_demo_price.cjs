const fs=require('fs');
const P='data/state.json';
const target = Number(process.env.PRICE||0);
if(!target){ console.log('⚠️ Seteá PRICE=0.016 (por ejemplo)'); process.exit(0); }
let s={}; try{s=JSON.parse(fs.readFileSync(P,'utf8'))}catch{}
if(!s.positions||!Array.isArray(s.positions.demo)){ console.log('⚠️ no hay DEMO'); process.exit(0); }
s.positions.demo=s.positions.demo.map(p=>({...p,priceNowUsd:target}));
fs.writeFileSync(P,JSON.stringify(s,null,2));
console.log('✅ bump DEMO priceNowUsd =',target);
