// src/services/state.js
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __DIR = path.dirname(fileURLToPath(import.meta.url));
// ../../data/state.json  (desde src/services)
const ROOT   = path.resolve(__DIR, '..', '..');
const DATAD  = path.join(ROOT, 'data');
const FILE   = path.join(DATAD, 'state.json');

// Pequeña cola para serializar escrituras y evitar condiciones de carrera
let _queue = Promise.resolve();
function enqueue(fn) { _queue = _queue.then(fn, fn); return _queue; }

async function _ensureFile() {
  await fs.mkdir(DATAD, { recursive: true });
  try { await fs.access(FILE); }
  catch { await fs.writeFile(FILE, JSON.stringify({ sniperOn:{}, realMode:{} }, null, 2)); }
}

async function _read() {
  await _ensureFile();
  const raw = await fs.readFile(FILE, 'utf8');
  try { return JSON.parse(raw) || {}; } catch { return { sniperOn:{}, realMode:{} }; }
}

async function _write(db) {
  await _ensureFile();
  const tmp = FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, FILE);
}

// -------- API PÚBLICA --------
export async function getSniperOnMap() {
  const db = await _read();
  return db.sniperOn || {};
}

export async function setSniperOn(uid, on) {
  return enqueue(async () => {
    const db = await _read();
    db.sniperOn = db.sniperOn || {};
    db.sniperOn[uid] = !!on;
    await _write(db);
    return true;
  });
}

export async function getRealModeMap() {
  const db = await _read();
  return db.realMode || {};
}

export async function setRealMode(uid, isReal) {
  return enqueue(async () => {
    const db = await _read();
    db.realMode = db.realMode || {};
    db.realMode[uid] = !!isReal;
    await _write(db);
    return true;
  });
}

// Opcional: limpiar todo lo de un user
export async function clearUser(uid) {
  return enqueue(async () => {
    const db = await _read();
    if (db.sniperOn)  delete db.sniperOn[uid];
    if (db.realMode)  delete db.realMode[uid];
    await _write(db);
    return true;
  });
}
