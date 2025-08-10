// src/services/vendors/tokensniffer.js
// TokenSniffer (adaptado a Solana) — sin API oficial para Solana.
// - Stub que retorna null o link a revisión manual.
// - Cuando tengas un plan PRO o scraper, reemplazás getTokenSnifferReport().

const BASE = 'https://tokensniffer.com/token/solana';

// Genera URL para revisión manual en TokenSniffer (cuando esté disponible)
export function getTokenSnifferLink(mint) {
  if (!mint) return null;
  return `${BASE}/${encodeURIComponent(mint)}`;
}

// Función principal (stub)
export async function getTokenSnifferReport(mint) {
  if (!mint) return null;
  // TODO: Integrar API/Scraper aquí cuando tengas acceso
  // Por ahora, devolvemos null y un link manual
  return {
    supported: false,
    link: getTokenSnifferLink(mint),
    report: null
  };
}
