import fs from 'node:fs';
import path from 'node:path';

const FILE = process.env.STATE_FILE || path.join(process.cwd(), 'data', 'state.json');

function ensureShape(st){
  st.positions = st.positions || {};
  st.positions.demo = Array.isArray(st.positions.demo) ? st.positions.demo : [];
  st.positions.real = Array.isArray(st.positions.real) ? st.positions.real : [];
  st.demo = st.demo || {};
  st.real = st.real || {};
  if (typeof st.demo.cash !== 'number') st.demo.cash = 10_000; // seed por defecto
  if (typeof st.real.cash !== 'number') st.real.cash = 0;
  return st;
}

export function loadState(){
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    return ensureShape(JSON.parse(raw));
  } catch {
    return ensureShape({});
  }
}

export function saveState(st){
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(st, null, 2));
}
