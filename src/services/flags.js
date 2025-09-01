import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
const FILE = 'var/flags.json';

async function ensureFile(){
  try { await mkdir(dirname(FILE), { recursive: true }); } catch {}
  try { await readFile(FILE, 'utf8'); }
  catch {
    const init = {
      mode: process.env.WALLET_MODE === 'REAL' ? 'REAL' : 'DEMO',
      autosniper: false,
      updatedAt: new Date().toISOString(),
    };
    await writeFile(FILE, JSON.stringify(init, null, 2));
  }
}

export async function getFlags(){
  await ensureFile();
  const txt = await readFile(FILE, 'utf8');
  return JSON.parse(txt);
}

export async function setFlags(patch){
  await ensureFile();
  const cur = await getFlags();
  const next = { ...cur, ...patch, updatedAt: new Date().toISOString() };
  await writeFile(FILE, JSON.stringify(next, null, 2));
  return next;
}
