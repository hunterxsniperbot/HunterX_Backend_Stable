import * as bank from './demoBank.js';

// -------- BUY (ya te funcionó, dejo robusto)
export async function buy(opts) {
  if (typeof bank.buy === 'function') return bank.buy(opts);
  if (typeof bank.demoBuy === 'function') return bank.demoBuy(opts);
  if (typeof bank.buyDemo === 'function') return bank.buyDemo(opts);
  throw new Error('demoBank.buy* no disponible (buy | demoBuy | buyDemo)');
}

// -------- SELL Parcial/Total (fallback si no existe)
export async function sellPct({ token, pct = 100, priceUsd }) {
  pct = Math.max(1, Math.min(100, Number(pct) || 100));

  // 1) Si existe nativo, úsalo
  if (typeof bank.sellPct === 'function') return bank.sellPct({ token, pct, priceUsd });
  if (typeof bank.demoSellPct === 'function') return bank.demoSellPct({ token, pct, priceUsd });

  // 2) Si sólo existe "sellAllDemo"
  if (typeof bank.sellAllDemo === 'function') {
    // a) 100% = directo
    if (pct === 100) {
      return bank.sellAllDemo({ token, priceUsd, reason: 'ui-pro' });
    }

    // b) Fallback parcial con get/set state
    const g = bank.getState?.();
    const s = typeof g?.then === 'function' ? await g : g;
    if (!s || !Array.isArray(s.positions)) {
      throw new Error('fallback parcial requiere getState() con positions');
    }

    const sym = String(token || '').toUpperCase();
    const pos = s.positions.find(p =>
      String(p.token || p.symbol || '').toUpperCase() === sym
    );
    if (!pos) throw new Error(`posición no encontrada para ${sym}`);

    const entry = Number(pos.priceIn || 0);
    const qty   = Number(pos.qty || 0);
    const amtIn = Number(pos.amountUsd || 0);
    const pxOut = Number(priceUsd || entry || 0);
    if (!qty || !entry || !amtIn) throw new Error('posición inválida (qty/priceIn/amountUsd)');

    // calcular venta parcial
    const sellQty   = qty * (pct / 100);
    const remainQty = qty - sellQty;

    // USD a precio de salida
    const soldUsd   = sellQty * pxOut;
    const remainUsd = remainQty * pxOut;

    // Ajuste de estado (conserva invariantes)
    pos.qty       = remainQty;
    pos.amountUsd = amtIn * (remainQty / Math.max(qty, 1e-12)); // proporcionado por entrada
    if (pos.qty <= 1e-9) {
      // cerrar del todo con nativo (deja registro en "closed")
      await bank.sellAllDemo({ token, priceUsd: pxOut, reason: 'ui-pro-close-rest' });
    }

    // recomputar agregados
    const sumOpen = (arr) => arr.reduce((acc, p) => acc + Number(p.amountUsd || 0), 0);
    s.invested = sumOpen(s.positions);
    s.cash     = Number(s.cash || 0) + soldUsd;
    s.total    = Number(s.cash || 0) + Number(s.invested || 0);

    const setter = bank.setState || bank.saveState || bank.putState || bank.updateState;
    if (setter) await setter(s);

    const realizedPct = ((pxOut - entry) / entry * 100).toFixed(2);
    return {
      ok: true,
      tradeId: pos.id || `demo-${Date.now()}`,
      soldUsd,
      soldPct: pct,
      remainUsd,
      avgExit: pxOut,
      realizedUsd: (pxOut - entry) * sellQty,   // aproximado
      realizedPct,
      unrealUsd: remainUsd - (pos.amountUsd || 0),
      unrealPct: entry ? (((pxOut - entry) / entry) * 100).toFixed(2) : '0.00',
    };
  }

  throw new Error('demoBank.sellPct* no disponible (sellPct | demoSellPct | sellAllDemo)');
}

// (opcional) passthrough
export const getState = bank.getState || (async () => ({}));
