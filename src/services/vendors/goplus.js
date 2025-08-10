// src/services/vendors/goplus.js
// GoPlus Labs (seguridad de tokens en Solana).
// - Modo sin clave: retorna null (no rompe el flujo).
// - Modo con clave (GOPLUS_API_KEY en .env): consulta riesgos (honeypot, sell limits, taxes, etc.).
//
// Campos típicos en result:
//   is_honeypot: '0' | '1'
//   cannot_sell_all: '0' | '1'
//   is_open_source: '0' | '1'
//   buy_tax, sell_tax: números en % (string/number)
//   holder_count / top10_holder_rate (según disponibilidad)

const BASE = 'https://api.gopluslabs.io/api/v1';
const KEY  = process.env.GOPLUS_API_KEY || '';

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function getJSON(url, { timeout = 5000, retries = 2 } = {}) {
  for (let i=0; i<=retries; i++){
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = await fetch(url, {
        headers: KEY ? { 'API-KEY': KEY, accept: 'application/json' } : { accept: 'application/json' },
        signal: ctrl.signal
      });
      clearTimeout(id);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      clearTimeout(id);
      if (i === retries) throw e;
      await sleep(250 + i*200);
    }
  }
}

// Normaliza un objeto "security" de GoPlus a tipos JS
function normalizeSecurity(obj){
  if (!obj) return null;
  const n = (v) => (v===null || v===undefined) ? null : Number(v);
  const b = (v) => String(v) === '1';
  return {
    honeypot: b(obj.is_honeypot),
    cannotSellAll: b(obj.cannot_sell_all),
    isOpenSource: String(obj.is_open_source) === '1',
    buyTax: n(obj.buy_tax),
    sellTax: n(obj.sell_tax),
    holderCount: n(obj.holder_count),
    top10HolderRate: n(obj.top10_holder_rate), // porcentaje (0–100) si está disponible
    raw: obj
  };
}

// Evalúa riesgos básicos con umbrales conservadores
export function evaluateRisks(sec){
  if (!sec) return { flags: [], level: 'unknown' };
  const flags = [];
  if (sec.honeypot) flags.push('honeypot_detectado');
  if (sec.cannotSellAll) flags.push('restriccion_venta');
  if (sec.sellTax !== null && sec.sellTax > 12) flags.push('sell_tax_>12%');
  if (sec.buyTax !== null && sec.buyTax > 12) flags.push('buy_tax_>12%');
  if (sec.top10HolderRate !== null && sec.top10HolderRate > 80) flags.push('concentracion_top10_>80%');
  // nivel global
  let level = 'ok';
  if (flags.length === 0) level = 'ok';
  else if (flags.includes('honeypot_detectado') || flags.includes('restriccion_venta')) level = 'critical';
  else level = 'warning';
  return { flags, level };
}

// Consulta principal: seguridad de un token (mint Solana)
export async function gpTokenSecuritySolana(mint){
  if (!mint) return null;
  if (!KEY) return null; // sin key, devolvemos null (modo free sin romper)
  const url = `${BASE}/token_security/solana?contract_addresses=${encodeURIComponent(mint)}`;
  const j = await getJSON(url).catch(() => null);
  const res = j?.result;
  if (!res) return null;
  const obj = res[mint] || (Array.isArray(res) ? res[0] : null) || null;
  return normalizeSecurity(obj);
}
