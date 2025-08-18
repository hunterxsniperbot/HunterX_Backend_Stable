// src/commands/wallet.js — minimalista, API-first, sin teclado Telegram (DEMO+REAL)
// ESM module

const API_BASE = process.env.API_BASE || 'http://127.0.0.1:3000';

const EMO = {
  header: '📱',
  real:   '💳',
  demo:   '🧪',
  token:  '🪙',
  entry:  '📥',
  price:  '📤',
  invest: '💵',
  pnl:    '📈',
  linkDs: '📊',
  linkSc: '📎',
  linkJp: '🌀',
  linkRd: '🌊',
};

// ---------- utils ----------
function fmtUsd(n) {
  const v = Number(n || 0);
  return v.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
function fmtPct(n) {
  const v = Number(n || 0);
  const sign = v >= 0 ? '+' : '';
  return `${sign}${v.toFixed(1)}%`;
}
function safeSymbol(s) { return String(s || 'TOKEN').slice(0, 20).toUpperCase(); }

function dsLink(mint) { return `https://dexscreener.com/solana/${mint}`; }
function scLink(mint) { return `https://solscan.io/token/${mint}`; }
function jpLink(mint) { return `https://jup.ag/swap/SOL-${mint}`; }
function rdLink(mint) { return `https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${mint}`; }

// ---------- API ----------
async function getWalletFromApi(mode = 'demo') {
  const url = `${API_BASE}/api/wallet?mode=${encodeURIComponent(mode)}`;
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) {
    const t = await res.text().catch(()=> '');
    throw new Error(`GET /api/wallet ${res.status}: ${t}`);
  }
  return res.json();
}

// ---------- render de secciones ----------
function buildSectionForMode(wallet, mode) {
  const positions = Array.isArray(wallet?.positions) ? wallet.positions : [];
  const list = positions.filter(p =>
    (p?.mode || 'demo') === mode && p?.isOpen !== false && Number(p?.investedUsd || 0) > 0
  );

  // balances desde la API; si faltara, fallback para DEMO
  const bal = (wallet?.balances && wallet.balances[mode]) ? wallet.balances[mode] : null;
  let invested = Number(bal?.investedUsd ?? 0);
  let cash     = Number(bal?.cashUsd     ?? 0);
  if (!bal && mode === 'demo') {
    const invSum = list.reduce((a, p) => a + Number(p?.investedUsd || 0), 0);
    invested = invSum;
    cash = Math.max(0, 10_000 - invSum);
  }
  const total = invested + cash;

  const lines = [];
  lines.push(`\n**${mode === 'real' ? EMO.real + ' Billetera Phantom (REAL)' : EMO.demo + ' Billetera DEMO'}**`);
  lines.push(`• Invertido: ${fmtUsd(invested)}`);
  lines.push(`• Libre para sniper: ${fmtUsd(cash)}`);
  lines.push(`• Total disponible: ${fmtUsd(total)}`);

  if (list.length === 0) {
    lines.push(`\n( Sin posiciones ${mode.toUpperCase()} )`);
    return lines.join('\n');
  }

  // Header del modo: si API.header se corresponde con el primer símbolo, úsalo; sino, arma uno local con pnl de esa pos
  const pos0 = list[0];
  const headerPnlText = (wallet?.header?.pnlText && wallet?.header?.symbol && wallet.header.symbol === pos0.symbol)
    ? wallet.header.pnlText
    : (() => {
        const u = Number(pos0?.pnlUsd || 0);
        const p = Number(pos0?.pnlPct || 0);
        const sign = u >= 0 ? '+' : '-';
        // quitamos el '$' de fmtUsd para escribir +$1,234.56
        return `${sign}${fmtUsd(Math.abs(u)).replace('$','') } (${fmtPct(p)})`;
      })();

  lines.push(`\n**${EMO.token} ${safeSymbol(pos0?.symbol)} — PnL: ${headerPnlText}**`);

  for (const pos of list) {
    const entry = Number(pos?.entryPriceUsd || 0);
    const now   = Number(pos?.priceNowUsd   || 0);
    const inv   = Number(pos?.investedUsd   || 0);
    const u     = Number(pos?.pnlUsd        || 0);
    const p     = Number(pos?.pnlPct        || 0);

    lines.push(`\n${EMO.token} $${safeSymbol(pos?.symbol)} **(${mode.toUpperCase()})**`);
    lines.push(`${EMO.entry} Entrada: ${entry ? entry.toFixed(4) : '—'}`);
    lines.push(`${EMO.price} Actual: ${now   ? now.toFixed(4)   : '—'}`);
    lines.push(`${EMO.invest} Invertido: ${fmtUsd(inv)}`);
    lines.push(`${EMO.pnl} PnL: ${u >= 0 ? '+' : '-'}${fmtUsd(Math.abs(u)).replace('$','')} (${fmtPct(p)})`);

    // Links (usa pos.links si viene de API; si no, derivado por mint)
    if (pos?.links) {
      const ds = pos.links.dexscreener || dsLink(pos.mint);
      const sc = pos.links.solscan     || scLink(pos.mint);
      const jp = pos.links.jupiter     || jpLink(pos.mint);
      const rd = pos.links.raydium     || rdLink(pos.mint);
      lines.push(`${EMO.linkDs} [DexScreener](${ds})  |  ${EMO.linkSc} [Solscan](${sc})  |  ${EMO.linkJp} [Jupiter](${jp})  |  ${EMO.linkRd} [Raydium](${rd})`);
    } else if (pos?.mint) {
      lines.push(`${EMO.linkDs} [DexScreener](${dsLink(pos.mint)})  |  ${EMO.linkSc} [Solscan](${scLink(pos.mint)})  |  ${EMO.linkJp} [Jupiter](${jpLink(pos.mint)})  |  ${EMO.linkRd} [Raydium](${rdLink(pos.mint)})`);
    }
  }

  return lines.join('\n');
}

function buildTextFromWallet(wallet) {
  const positions = Array.isArray(wallet?.positions) ? wallet.positions : [];
  const demoCount = positions.filter(p => (p?.mode || 'demo') === 'demo' && p?.isOpen !== false && Number(p?.investedUsd || 0) > 0).length;
  const realCount = positions.filter(p => (p?.mode || 'demo') === 'real' && p?.isOpen !== false && Number(p?.investedUsd || 0) > 0).length;
  const total = demoCount + realCount;

  const lines = [];
  lines.push(`${EMO.header} Posiciones abiertas • DEMO: ${demoCount} • REAL: ${realCount} • Total: ${total}`);

  if (wallet?.header?.pnlText) {
    const sym = wallet.header.symbol ? ` ${safeSymbol(wallet.header.symbol)}` : '';
    lines.push(`**${EMO.token}${sym} — PnL: ${wallet.header.pnlText}**`);
  }

  lines.push(buildSectionForMode(wallet, 'demo'));
  lines.push(buildSectionForMode(wallet, 'real'));

  return lines.join('\n');
}

// ---------- registro del comando (compatible con node-telegram-bot-api y Telegraf) ----------
export default function register(bot) {
  // node-telegram-bot-api
  if (typeof bot.onText === 'function') {
    bot.onText(/^\/wallet(?:@[\w_]+)?(?:\s+.*)?$/, async (msg) => {
      const chatId = msg.chat.id;
      try {
        const walletDemo = await getWalletFromApi('demo').catch(()=>null);
        const walletReal = await getWalletFromApi('real').catch(()=>null);

        const merged = (() => {
          const w = walletDemo || walletReal;
          if (!w) return { positions: [], balances: { demo:{investedUsd:0,cashUsd:0,totalUsd:0}, real:{investedUsd:0,cashUsd:0,totalUsd:0} } };
          const demoPos = walletDemo?.positions || [];
          const realPos = walletReal?.positions || [];
          return {
            ...w,
            positions: [...demoPos, ...realPos],
            balances: {
              demo: walletDemo?.balances?.demo || { investedUsd: 0, cashUsd: 0, totalUsd: 0 },
              real: walletReal?.balances?.real || { investedUsd: 0, cashUsd: 0, totalUsd: 0 },
            },
            header: walletDemo?.header || walletReal?.header || null,
          };
        })();

        const text = buildTextFromWallet(merged);
        await bot.sendMessage(chatId, text, { parse_mode: 'Markdown', disable_web_page_preview: true });
      } catch (e) {
        console.error('wallet command:', e);
        await bot.sendMessage(chatId, '⚠️ Error mostrando la wallet.', { parse_mode: 'Markdown' });
      }
    });
    return;
  }

  // Telegraf (fallback)
  if (typeof bot.command === 'function') {
    bot.command('wallet', async (ctx) => {
      try {
        const walletDemo = await getWalletFromApi('demo').catch(()=>null);
        const walletReal = await getWalletFromApi('real').catch(()=>null);

        const merged = (() => {
          const w = walletDemo || walletReal;
          if (!w) return { positions: [], balances: { demo:{investedUsd:0,cashUsd:0,totalUsd:0}, real:{investedUsd:0,cashUsd:0,totalUsd:0} } };
          const demoPos = walletDemo?.positions || [];
          const realPos = walletReal?.positions || [];
          return {
            ...w,
            positions: [...demoPos, ...realPos],
            balances: {
              demo: walletDemo?.balances?.demo || { investedUsd: 0, cashUsd: 0, totalUsd: 0 },
              real: walletReal?.balances?.real || { investedUsd: 0, cashUsd: 0, totalUsd: 0 },
            },
            header: walletDemo?.header || walletReal?.header || null,
          };
        })();

        const text = buildTextFromWallet(merged);
        await ctx.reply(text, { parse_mode: 'Markdown', disable_web_page_preview: true });
      } catch (e) {
        console.error('wallet command:', e);
        await ctx.reply('⚠️ Error mostrando la wallet.', { parse_mode: 'Markdown' });
      }
    });
    return;
  }

  console.warn('wallet: interfaz de bot desconocida (no hay onText ni command)');
}
