// src/services/demoBank.js — banco DEMO simple por usuario (persiste en .demo_bank.json)
import fs from 'fs';
import path from 'path';

const FILE = path.resolve('.demo_bank.json');

function readAll() {
  try {
    const raw = fs.readFileSync(FILE, 'utf8');
    const data = JSON.parse(raw);
    return (data && typeof data === 'object') ? data : {};
  } catch { return {}; }
}
function writeAll(obj) {
  try {
    fs.writeFileSync(FILE, JSON.stringify(obj, null, 2));
    return true;
  } catch { return false; }
}
function toUsd(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Number(v.toFixed(2))) : 0;
}

export function get(uid) {
  const all = readAll();
  const start = toUsd(process.env.DEMO_START_USD || 0);
  if (!(uid in all)) {
    all[uid] = { cashUsd: start, updatedAt: new Date().toISOString() };
    writeAll(all);
  }
  return toUsd(all[uid].cashUsd);
}
export function set(uid, usd) {
  const all = readAll();
  all[uid] = { cashUsd: toUsd(usd), updatedAt: new Date().toISOString() };
  writeAll(all);
  return get(uid);
}
export function add(uid, deltaUsd) {
  const cur = get(uid);
  return set(uid, cur + toUsd(deltaUsd));
}
export function sub(uid, deltaUsd) {
  const cur = get(uid);
  const next = Math.max(0, cur - toUsd(deltaUsd));
  return set(uid, next);
}
export function reset(uid, to = null) {
  const base = toUsd(to == null ? (process.env.DEMO_START_USD || 0) : to);
  return set(uid, base);
}
export default { get, set, add, sub, reset };
