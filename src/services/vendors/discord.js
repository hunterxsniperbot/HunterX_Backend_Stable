// src/services/vendors/discord.js
// Discord vendor (opcional):
//  - fetchDiscordJSON(): lee un feed JSON externo (DISCORD_FEED_URL) con mensajes {content: "...", ts: ...}
//  - parseMintsFromText(): extrae posibles mint addresses de un texto
//  - sendWebhook(): envía un mensaje simple a un webhook (DISCORD_WEBHOOK_URL o URL que pases)

const FEED_URL   = process.env.DISCORD_FEED_URL || '';     // tu endpoint propio con JSON de mensajes
const WEBHOOK_URL= process.env.DISCORD_WEBHOOK_URL || '';  // webhook para enviar mensajes a un canal

function withTimeout(promise, ms=5000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(id); resolve(r); })
           .catch(e => { clearTimeout(id); reject(e); });
  });
}

export async function fetchDiscordJSON({ url } = {}) {
  const target = url || FEED_URL;
  if (!target) return null;
  const res = await withTimeout(fetch(target, { headers: { accept: 'application/json' } }), 5000).catch(()=>null);
  if (!res || !res.ok) return null;
  return res.json().catch(()=>null);
}

// Extrae mints Solana estilo base58 (32-44 chars aprox)
export function parseMintsFromText(text) {
  if (!text) return [];
  const re = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g; // base58 sin 0 O I l
  const out = [];
  const seen = new Set();
  let m;
  while ((m = re.exec(text)) !== null) {
    const cand = m[0];
    if (!seen.has(cand)) { seen.add(cand); out.push(cand); }
  }
  return out;
}

// Enviar mensaje a webhook
export async function sendWebhook({ content, url } = {}) {
  const target = url || WEBHOOK_URL;
  if (!target || !content) return false;
  const res = await withTimeout(fetch(target, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ content: String(content) })
  }), 5000).catch(()=>null);
  return !!(res && res.ok);
}
