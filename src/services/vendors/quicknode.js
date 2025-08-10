// src/services/vendors/quicknode.js
// QuickNode (Solana JSON-RPC) — Vendor on-chain.
// - Si QUICKNODE_RPC_URL no está en .env → funciones devuelven null (no rompen).
// - Cuando lo configures, podrás usar lectura on-chain para pools/slots/tx.
// - Dejamos un esqueleto para futuro: lectura de estado de pools Raydium on-chain.

const RPC_URL = process.env.QUICKNODE_RPC_URL || '';

function hasRpc() { return !!RPC_URL; }

function withTimeout(promise, ms=6000) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(r => { clearTimeout(id); resolve(r); })
           .catch(e => { clearTimeout(id); reject(e); });
  });
}

let _rpcId = 1;
async function rpcCall(method, params = [], { timeout=6000 } = {}) {
  if (!hasRpc()) return null;
  const body = JSON.stringify({ jsonrpc: '2.0', id: _rpcId++, method, params });
  const res = await withTimeout(fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body
  }), timeout).catch(()=>null);
  if (!res || !res.ok) return null;
  const j = await res.json().catch(()=>null);
  if (!j || j.error) return null;
  return j.result ?? null;
}

// --------- Funciones RPC generales ---------

export async function qnGetLatestSlot() {
  return await rpcCall('getSlot', [{ commitment: 'confirmed' }]).catch(()=>null);
}

export async function qnGetBlockTime(slot) {
  if (!slot) return null;
  return await rpcCall('getBlockTime', [slot]).catch(()=>null);
}

export async function qnGetAccountInfo(pubkey, { encoding='base64' } = {}) {
  if (!pubkey) return null;
  return await rpcCall('getAccountInfo', [pubkey, { encoding }]).catch(()=>null);
}

export async function qnGetProgramAccounts(programId, { filters=[], encoding='base64' } = {}) {
  if (!programId) return null;
  return await rpcCall('getProgramAccounts', [
    programId,
    { encoding, filters }
  ]).catch(()=>null);
}

// --------- Raydium on-chain (esqueleto para futuro) ---------
// NOTA: Leer pools de Raydium on-chain requiere decodificar cuentas
// según el layout del AMM. Dejamos la firma y devolvemos null por ahora.
// Cuando quieras, armamos el decoder para el programa AMM de Raydium.

export async function qnRaydiumPoolState(_poolId) {
  // TODO: implementar decodificador del AMM (layout binario)
  return null;
}

// Selector híbrido (cuando lo uses desde otros servicios):
// Si hay on-chain listo → usar qnRaydiumPoolState()
// Si no, cae al vendor Raydium API desde fuera (raydium.js)

export function qnHasRpc() { return hasRpc(); }
