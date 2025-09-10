import fs from 'fs';

const files = [
  "src/bot/inlinePnlSell.js",
  "src/commands/demo_cmds.js",
  "src/commands/registro.js",
];

let fail = false;

for (const f of files){
  const s = fs.readFileSync(f, "utf8");

  // (1) Duplicados de función
  const names = [...s.matchAll(/function\s+([A-Za-z0-9_]+)\s*\(/g)].map(m=>m[1]);
  const counts = names.reduce((m,n)=>(m[n]=(m[n]||0)+1,m),{});
  const dups = Object.entries(counts).filter(([,c])=>c>1);
  if (dups.length){
    fail = true;
    console.error(`[DUPE FUNCS] ${f}:`, dups.map(([n,c])=>`${n}x${c}`).join(", "));
  }

  // (2) 'async' suelto (no "async function")
  const strayAsync = s.split(/\n/).map((L,i)=>({i:i+1,L})).filter(x=>/^\s*async(?!\s*function\b)/.test(x.L));
  if (strayAsync.length){
    fail = true;
    console.error(`[STRAY ASYNC] ${f}:`, strayAsync.map(x=>x.i).join(", "));
  }

  // (3) 'return' top-level (profundidad 0)
  let depth=0, topReturns=[];
  const lines = s.split('\n');
  for (let i=0;i<lines.length;i++){
    const raw  = lines[i];
    const bare = raw.replace(/'[^']*'|"[^"]*"|`[^`]*`/g,''); // ignora cadenas
    if (/^\s*return\b/.test(raw) && depth===0) topReturns.push(i+1);
    for (const ch of bare){ if (ch==='{') depth++; else if (ch==='}') depth=Math.max(0,depth-1); }
  }
  if (topReturns.length){
    fail = true;
    console.error(`[TOP-LEVEL RETURN] ${f}:`, topReturns.join(", "));
  }
}

if (fail) process.exit(1);
console.log("✔ Checks OK (sin duplicados, sin 'async' suelto, sin 'return' top-level)");
