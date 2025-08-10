const CMC = 'https://pro-api.coinmarketcap.com/v1';
const KEY = process.env.CMC_API_KEY || '';

async function get(path, params={}) {
  if (!KEY) return null;
  const u = new URL(CMC + path);
  for (const [k,v] of Object.entries(params)) u.searchParams.set(k, v);
  const r = await fetch(u, { headers: { 'X-CMC_PRO_API_KEY': KEY, accept:'application/json' } });
  if (!r.ok) throw new Error(`cmc ${r.status}`);
  return r.json();
}

export async function cmcSolPrice() {
  const j = await get('/cryptocurrency/quotes/latest', { symbol: 'SOL', convert: 'USD' });
  return Number(j?.data?.SOL?.quote?.USD?.price) || null;
}
