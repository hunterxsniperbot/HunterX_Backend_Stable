// src/services/vendors/jupiter.js
// Jupiter Aggregator vendor — consulta de rutas óptimas y construcción de transacciones
// Funciona con RPC de Solana + API pública de Jupiter
// API base: https://quote-api.jup.ag

const BASE = 'https://quote-api.jup.ag';
const RPC = process.env.QUICKNODE_RPC_URL || ''; // opcional, para validar ruta/tx

function withTimeout(promise, ms=5000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(id); resolve(r); })
           .catch(e => { clearTimeout(id); reject(e); });
  });
}

async function apiGet(path, params={}, { timeout=5000 } = {}) {
  const u = new URL(BASE + path);
  for (const [k,v] of Object.entries(params)) {
    if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
  }
  const res = await withTimeout(fetch(u, { headers: { accept: 'application/json' } }), timeout).catch(()=>null);
  if (!res || !res.ok) return null;
  return res.json().catch(()=>null);
}

async function apiPost(path, body={}, { timeout=5000 } = {}) {
  const res = await withTimeout(fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }), timeout).catch(()=>null);
  if (!res || !res.ok) return null;
  return res.json().catch(()=>null);
}

// ------------------ FUNCIONES PÚBLICAS ------------------

// Obtener mejores rutas de swap
export async function jupGetQuote({ inputMint, outputMint, amountUi, slippageBps=50 }) {
  if (!inputMint || !outputMint || !amountUi) return null;
  const amount = Math.floor(amountUi * 10 ** 9); // asumiendo SOL 9 dec (cambiar si otro token)
  const j = await apiGet('/v6/quote', {
    inputMint,
    outputMint,
    amount,
    slippageBps,
    onlyDirectRoutes: false,
  });
  if (!j) return null;
  return {
    routes: j?.routes || [],
    contextSlot: j?.contextSlot,
    timeTaken: j?.timeTaken,
    raw: j
  };
}

// Construir tx lista para firmar (swap)
export async function jupBuildSwap({ route, userPublicKey }) {
  if (!route || !userPublicKey) return null;
  const j = await apiPost('/v6/swap', {
    route,
    userPublicKey,
    wrapUnwrapSOL: true,
    dynamicComputeUnitLimit: true
  });
  if (!j) return null;
  return {
    swapTransaction: j?.swapTransaction,
    lastValidBlockHeight: j?.lastValidBlockHeight,
    raw: j
  };
}

// Helper: impacto de precio estimado (porcentaje)
export function jupPriceImpact(route) {
  if (!route) return null;
  const impact = route?.priceImpactPct ?? route?.priceImpact ?? null;
  return impact !== null ? Number((impact * 100).toFixed(3)) : null;
}
