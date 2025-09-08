import fs from 'fs';

const file = 'src/commands/autoSniper.js';
const newFn = fs.readFileSync('tools/patches/announceAutoBuy.js','utf8');
let src = fs.readFileSync(file, 'utf8');

// Quitar versiones antiguas (function o async function) e inyectar nueva
const re = /(async\s+)?function\s+announceAutoBuy\s*\([\s\S]*?\n\}\n/;
if (re.test(src)) {
  src = src.replace(re, newFn + '\n');
} else {
  src += '\n\n' + newFn + '\n';
}

// Asegurar que haya llamada con await
src = src.replace(
  /(\bif\s*\(\s*res\s*&&\s*res\.ok\s*\)\s*\{\s*)(?:await\s*)?announceAutoBuy\((bot,\s*uid,\s*res)\);\s*\}/,
  '$1await announceAutoBuy($2); }'
);

// Fallback: si no existiera la llamada post maybeAutoBuyDemo, la insertamos
if (!/announceAutoBuy\(bot,\s*uid,\s*res\)/.test(src)) {
  src = src.replace(
    /(const\s+res\s*=\s*await\s+maybeAutoBuyDemo\([^)]*\);\s*)/,
    '$1if (res && res.ok) { await announceAutoBuy(bot, uid, res); }\n'
  );
}

fs.writeFileSync(file, src);
console.log('✅ announceAutoBuy actualizada/inyectada.');
