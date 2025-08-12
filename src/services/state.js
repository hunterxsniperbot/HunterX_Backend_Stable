import fs from 'fs/promises';
import path from 'path';

const FILE = process.env.STATE_FILE || './data/state.json';

async function ensureDirFor(filePath) {
  const dir = path.dirname(filePath);
  try { await fs.mkdir(dir, { recursive: true }); } catch {}
}
async function loadState() {
  try {
    const buf = await fs.readFile(FILE);
    return JSON.parse(buf.toString('utf8'));
  } catch {
    return {};
  }
}
async function saveState(state) {
  await ensureDirFor(FILE);
  const tmp = FILE + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, FILE);
}
export async function getSniperOnMap() {
  const s = await loadState();
  return s.sniperOn || {};
}
export async function setSniperOn(uid, on) {
  const s = await loadState();
  s.sniperOn = s.sniperOn || {};
  s.sniperOn[uid] = !!on;
  await saveState(s);
}
export async function clearUser(uid) {
  const s = await loadState();
  if (s.sniperOn && uid in s.sniperOn) delete s.sniperOn[uid];
  await saveState(s);
}
