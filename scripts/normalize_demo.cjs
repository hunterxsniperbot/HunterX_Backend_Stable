const fs = require('fs');
const P = 'data/state.json';
const DEMO_BASE = Number(process.env.DEMO_BASE_USD || 10000);

let st={}; try{ st=JSON.parse(fs.readFileSync(P,'utf8')) }catch{}
st.positions = st.positions || {};
const demo = Array.isArray(st.positions.demo) ? st.positions.demo : [];

const invested = demo.filter(p => p && p.isOpen !== false)
  .reduce((a,p)=> a + Number(p.investedUsd||0), 0);

let cash = Number(st?.demo?.cash);
if (!Number.isFinite(cash)) cash = DEMO_BASE - invested;
const sane = x => Number(Number(x).toFixed(2));
if (cash < 0 || cash > DEMO_BASE*1.5) cash = DEMO_BASE - invested;

st.demo = { cash: sane(cash) };
fs.mkdirSync('data',{recursive:true});
fs.writeFileSync(P, JSON.stringify(st,null,2));
console.log('✅ DEMO normalizada:', { invested: sane(invested), cash: sane(cash), total: sane(invested + cash) });
