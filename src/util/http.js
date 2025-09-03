import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileP = promisify(execFile);

// fetch → fallback curl
export async function getJson(url, { timeoutMs=3500, ua='Mozilla/5.0' } = {}) {
  // 1) undici fetch
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort('timeout'), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'user-agent': ua, 'accept':'application/json' }, signal: ac.signal });
    if (!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  } catch (e) {
    // 2) fallback curl (IPv4)
    try {
      const { stdout } = await execFileP('curl', ['-sS','-4','-A', ua, url], { timeout: timeoutMs+1500 });
      return JSON.parse(stdout);
    } catch (e2) {
      console.error('[http.getJson] fail', url, String(e?.message||e), '| curl:', String(e2?.message||e2));
      return null;
    }
  } finally { clearTimeout(t); }
}
