// src/services/fastsell.js — HOT PATH para venta manual con tuner dinámico
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import nacl from 'tweetnacl';
import { loadPolicySync } from '../policy.js';
import { computeTradeParams } from './tuner.js';

const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const JUP_BASE = process.env.JUPITER_BASE || 'https://quote-api.jup.ag';
const JUP_TIMEOUT = Number(process.env.JUPITER_TIMEOUT_MS || 1200);

const QUICKNODE_URL = process.env.QUICKNODE_URL;
const PHANTOM_ADDRESS = process.env.PHANTOM_ADDRESS;
const PHANTOM_PRIVATE_KEY = process.env.PHANTOM_PRIVATE_KEY;

const _conn = new Connection(QUICKNODE_URL || 'https://api.mainnet-beta.solana.com', 'processed');

// defaults base (el tuner los ajusta por operación)
const BASES = {
  slippageBps: Number(process.env.FASTSELL_SLIPPAGE_BPS || 100),
  priorityLamports: Number(process.env.FASTSELL_PRIORITY_LAMPORTS || 0),
  skipPreflight: String(process.env.FASTSELL_SKIP_PREFLIGHT || 'true')==='true',
  maxPriceImpactBps: Number(process.env.AUTOSNIPER_MAX_PRICE_IMPACT_BPS || 300),
  jupTimeoutMs: Number(process.env.JUPITER_TIMEOUT_MS || 1200)
};

// cache de blockhash (25s)
let _bhCache = { value: null, ts: 0 };
async function recentBlockhash() {
  const now = Date.now();
  if (_bhCache.value && now - _bhCache.ts < 25_000) return _bhCache.value;
  const { blockhash } = await _conn.getLatestBlockhash('processed');
  _bhCache = { value: blockhash, ts: now };
  return blockhash;
}

function timeoutFetch(resource, opts={}, ms=JUP_TIMEOUT) {
  const c = new AbortController();
  const t = setTimeout(()=>c.abort(), ms);
  return fetch(resource, { ...opts, signal: c.signal }).finally(()=>clearTimeout(t));
}

async function tokenBalanceRaw(owner, mintStr) {
  const ownerPk = new PublicKey(owner);
  const mintPk = new PublicKey(mintStr);
  const resp = await _conn.getParsedTokenAccountsByOwner(ownerPk, { mint: mintPk }, 'processed');
  let amount = 0n, decimals = 0;
  for (const it of resp.value) {
    const info = it.account.data.parsed.info;
    decimals = info.tokenAmount.decimals;
    amount += BigInt(info.tokenAmount.amount);
  }
  return { amountRaw: amount, decimals };
}

function parseAmountInput(input, balRaw, decimals) {
  const s = String(input||'').trim().toLowerCase();
  if (s==='all' || s==='todo' || s==='100%') return balRaw;
  if (s.endsWith('%')) {
    const pct = Math.max(0, Math.min(100, Number(s.slice(0,-1))));
    return (balRaw * BigInt(Math.round(pct*100)))/BigInt(100*100);
  }
  const f = Number(s.replace(',', '.'));
  if (!isFinite(f) || f<=0) throw new Error('Cantidad inválida');
  const mul = BigInt(10)**BigInt(decimals);
  return BigInt(Math.floor(f * Number(mul)));
}

function ensureKeypair() {
  if (!PHANTOM_PRIVATE_KEY) throw new Error('PHANTOM_PRIVATE_KEY ausente (.env)');
  const arr = JSON.parse(PHANTOM_PRIVATE_KEY);
  const kp = nacl.sign.keyPair.fromSecretKey(Uint8Array.from(arr));
  const pub = new PublicKey(kp.publicKey).toBase58();
  if (PHANTOM_ADDRESS && PHANTOM_ADDRESS !== pub) {
    console.warn('[fastsell] PHANTOM_ADDRESS env no coincide con clave derivada');
  }
  return { kp, pubkey: new PublicKey(pub) };
}

async function jupQuote({ inputMint, outputMint, amountRaw, slippageBps }) {
  const u = new URL(`${JUP_BASE}/v6/quote`);
  u.searchParams.set('inputMint', inputMint);
  u.searchParams.set('outputMint', outputMint);
  u.searchParams.set('amount', amountRaw.toString());
  u.searchParams.set('slippageBps', String(slippageBps));
  u.searchParams.set('asLegacyTransaction', 'false');
  u.searchParams.set('maxAccounts', '32');
  const r = await timeoutFetch(u.toString(), {}, JUP_TIMEOUT);
  if (!r.ok) throw new Error(`Jupiter quote HTTP ${r.status}`);
  return r.json();
}

async function jupSwapTx({ quoteResponse, userPublicKey, prioritizationFeeLamports, timeoutMs }) {
  const body = {
    quoteResponse,
    userPublicKey,
    wrapAndUnwrapSol: true,
    dynamicSlippage: false,
    prioritizationFeeLamports: Math.max(0, Number(prioritizationFeeLamports||0)),
  };
  const r = await timeoutFetch(`${JUP_BASE}/v6/swap`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }, timeoutMs ?? JUP_TIMEOUT);
  if (!r.ok) throw new Error(`Jupiter swap HTTP ${r.status}`);
  return r.json();
}

export async function sellFast({ mint, amountInput /* 'all' | '50%' | '1.23' */, contextExtra = {} }) {
  const policy = loadPolicySync();
  const mode = policy?.execution?.mode || 'demo';

  if (!mint) throw new Error('Debe indicar mint del token a vender');
  const { kp, pubkey } = ensureKeypair();

  // 1) balance y cantidad
  const { amountRaw: balRaw, decimals } = await tokenBalanceRaw(pubkey, mint);
  if (balRaw===0n) throw new Error('Balance 0 para ese mint');
  const amtRaw = parseAmountInput(amountInput||'all', balRaw, decimals);
  if (amtRaw<=0n) throw new Error('Cantidad a vender <= 0');

  // 2) parámetros preliminares (antes del quote)
  const ctxBase = {
    mode,
    liquidityUSD: contextExtra.liquidityUSD,
    poolAgeSec: contextExtra.poolAgeSec,
    taxesBps: contextExtra.taxesBps,
    honeypot: contextExtra.honeypot,
    tradingOpen: contextExtra.tradingOpen,
    freezeEnabled: contextExtra.freezeEnabled,
    mintRenounced: contextExtra.mintRenounced,
    volatilityBps1m: contextExtra.volatilityBps1m,
    spreadBps: contextExtra.spreadBps,
    rpcP95ConfirmMs: contextExtra.rpcP95ConfirmMs,
    quoteTimeMs: undefined,
    base: BASES
  };
  const prelim = computeTradeParams(ctxBase);

  // 3) quote con slippage preliminar
  const quote = await jupQuote({
    inputMint: mint,
    outputMint: USDC,
    amountRaw: amtRaw,
    slippageBps: prelim.slippageBps,
  });

  // 4) re-evaluar con tiempo real del quote
  const tuned = computeTradeParams({ ...ctxBase, quoteTimeMs: Number(quote?.timeTaken || 0) });

  // 5) obtener tx de swap (con timeout ajustado)
  const swap = await jupSwapTx({
    quoteResponse: quote,
    userPublicKey: pubkey.toBase58(),
    prioritizationFeeLamports: tuned.priorityLamports,
    timeoutMs: tuned.jupTimeoutMs
  });

  // 6) firmar y (si REAL) transmitir
  const raw = Buffer.from(swap.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(raw);
  tx.sign([kp]);

  if (mode==='demo') {
    return {
      mode, simulated: true, signature: `DEMO-${Date.now()}`,
      expectedOut: quote.outAmount,
      priceInfo: { in: quote.inAmount, out: quote.outAmount, slippageBps: prelim.slippageBps },
      routeInfo: { contextSlot: quote.contextSlot, timeTaken: quote.timeTaken, tuned },
    };
  }

  const sigHex = await _conn.sendRawTransaction(tx.serialize(), {
    skipPreflight: tuned.skipPreflight,
    preflightCommitment: 'processed',
    maxRetries: 2,
  });

  // 7) confirmación "confirmed" (no bloqueante si falla)
  const bh = await recentBlockhash();
  await _conn.confirmTransaction({ signature: sigHex, blockhash: bh, lastValidBlockHeight: 0 }, 'confirmed')
    .catch(()=>{});

  return {
    mode, simulated: false, signature: sigHex,
    expectedOut: quote.outAmount,
    priceInfo: { in: quote.inAmount, out: quote.outAmount, slippageBps: prelim.slippageBps },
    routeInfo: { contextSlot: quote.contextSlot, timeTaken: quote.timeTaken, tuned },
  };
}
