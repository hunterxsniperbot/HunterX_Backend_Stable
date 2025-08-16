import fs from 'node:fs';
import path from 'node:path';

const DATAD = path.resolve('data');
const FILE  = path.join(DATAD, 'state.json');

export function loadState() {
  try {
    const txt = fs.readFileSync(FILE, 'utf8');
    const j = JSON.parse(txt);
    return (j && typeof j === 'object') ? j : {};
  } catch {
    return {};
  }
}

export function saveState(st) {
  fs.mkdirSync(DATAD, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(st, null, 2));
  return true;
}
