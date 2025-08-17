// src/commands/wallet_sell.js — ventas parciales + residual + cash sync
import { loadState, saveState } from '../services/state_compat.js';
import { getPriceUSD }          from '../services/prices.js';

const RESID = Number(process.env.RESIDUAL_USD_THRESHOLD || 1);

export default function attachWalletSell(bot){
  bot.on('callback_query', async (q)=>{
    try{
      const data = String(q.data || '');
      const m = data.match(/^sell:([^:]+):(\d{1,3})$/);
      if(!m) return;
      const [, posId, pctStr] = m;
      let pct = Math.min(100, Math.max(1, Number(pctStr)));

      const st = loadState();
      st.positions = st.positions || {};
      const arrDemo = Array.isArray(st.positions.demo) ? st.positions.demo : [];
      const arrReal = Array.isArray(st.positions.real) ? st.positions.real : [];
      const all    = [...arrDemo, ...arrReal];

      const pos = all.find(p => p && p.id === posId && (p.isOpen !== false));
      if(!pos){ await bot.answerCallbackQuery(q.id, {text:'Posición no encontrada'}).catch(()=>{}); return; }

      const invBefore = Number(pos.investedUsd || 0);
      if(invBefore <= 0.001){
        await bot.answerCallbackQuery(q.id, {text:'Sin saldo en posición'}).catch(()=>{});
        return;
      }

      let priceNow = 0;
      try { const r = await getPriceUSD(pos.mint); priceNow = Number(r?.price || r || 0); } catch {}
      if(priceNow <= 0){ await bot.answerCallbackQuery(q.id, {text:'Precio no disponible'}).catch(()=>{}); return; }

      // Fracción solicitada sobre el invertido ACTUAL
      let fracReq = pct / 100;
      if(fracReq > 1) fracReq = 1;
      let sellUsd  = invBefore * fracReq;
      if(sellUsd > invBefore) sellUsd = invBefore;

      const entry   = Number(pos.entryPriceUsd || 0);
      const gainPct = entry > 0 ? (priceNow/entry - 1) : 0;
      const realized= sellUsd * gainPct;

      // Aplica venta
      pos.investedUsd   = Math.max(0, invBefore - sellUsd);
      pos.partialCount  = (pos.partialCount || 0) + 1;

      // Residuo -> cerrar si queda < RESID
      if(pos.investedUsd < RESID){
        pos.investedUsd = 0;
        pos.isOpen      = false;
        pos.status      = 'closed';
        pos.closedAt    = Date.now();
      }

      // Ajuste de cash (demo/real)
      const mode = (pos.mode === 'real') ? 'real' : 'demo';
      st[mode] = st[mode] || {};
      if(typeof st[mode].cash !== 'number') st[mode].cash = 0;
      // Entradas en USD: principal vendido + PnL realizado
      st[mode].cash = Math.max(0, Number(st[mode].cash) + sellUsd + realized);

      saveState(st);

      const sign = realized >= 0 ? '+' : '';
      await bot.answerCallbackQuery(q.id, {
        text: `Vendido ${pct}% ${pos.symbol || ''} ${sign}$${Math.abs(realized).toFixed(2)}`
      }).catch(()=>{});
    }catch{
      await bot.answerCallbackQuery(q.id, {text:'Error en venta'}).catch(()=>{});
    }
  });
}
