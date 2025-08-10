// src/services/phantom.js — ESM
import bs58 from 'bs58';
import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';

let PAPER = true; // DEMO por defecto
export function setPaperTrading(flag){ PAPER = !!flag; }

function getConn() {
  const rpc = process.env.QUICKNODE_HTTP_URL;
  if (!rpc) throw new Error('Falta QUICKNODE_HTTP_URL en .env');
  return new Connection(rpc, 'confirmed');
}

function getKeypair() {
  // Provee UNA de estas:
  // 1) PRIVATE_KEY_B58 (clave secreta en base58)
  // 2) PRIVATE_KEY_HEX (hex)
  const b58 = process.env.PRIVATE_KEY_B58 || '';
  const hex = process.env.PRIVATE_KEY_HEX || '';
  if (b58) {
    const secret = bs58.decode(b58);
    return Keypair.fromSecretKey(secret);
  }
  if (hex) {
    const bytes = Uint8Array.from(Buffer.from(hex, 'hex'));
    return Keypair.fromSecretKey(bytes);
  }
  throw new Error('Falta PRIVATE_KEY_B58 o PRIVATE_KEY_HEX en .env');
}

// Jupiter helpers
async function jupQuote({ inputMint, outputMint, amount, slippageBps }) {
  const url = new URL('https://quote-api.jup.ag/v6/quote');
  url.searchParams.set('inputMint', inputMint);
  url.searchParams.set('outputMint', outputMint);
  url.searchParams.set('amount', String(amount));
  url.searchParams.set('slippageBps', String(slippageBps));
  url.searchParams.set('swapMode', 'ExactIn');
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Quote HTTP ${r.status}`);
  return r.json();
}

async function jupSwap({ quoteResponse, userPublicKey }) {
  const r = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ quoteResponse, userPublicKey, wrapAndUnwrapSol: true, computeUnitPriceMicroLamports: 'auto' })
  });
  if (!r.ok) throw new Error(`Swap HTTP ${r.status}`);
  return r.json();
}

const SOL_MINT = 'So11111111111111111111111111111111111111112';

export async function getSolBalance(){
  const conn = getConn();
  const kp = getKeypair();
  const lam = await conn.getBalance(kp.publicKey, 'confirmed');
  return lam / 1e9;
}

export async function buyToken({ mintAddress, amountUsd, slippage }) {
  if (PAPER) return `MOCK_BUY_${Date.now()}`;

  // 1) Calcular amount en lamports según precio de SOL/USD estimado (mejor si pasás amountSol directo)
  const solUsd =  Number(process.env.SOL_PRICE_FALLBACK || 170);
  const amountSol = amountUsd / solUsd;
  const amountLamports = Math.max(1, Math.floor(amountSol * 1e9));

  const conn = getConn();
  const kp = getKeypair();

  // 2) Quote SOL -> TOKEN
  const slippageBps = Math.max(30, Math.min(1200, Math.round(Number(slippage) * 100))); // % -> bps clamp
  const quote = await jupQuote({ inputMint: SOL_MINT, outputMint: mintAddress, amount: amountLamports, slippageBps });

  // 3) Crear tx con Jupiter
  const swapResp = await jupSwap({ quoteResponse: quote, userPublicKey: kp.publicKey.toBase58() });
  const swapTx = swapResp?.swapTransaction;
  if (!swapTx) throw new Error('swapTransaction vacío');

  const txBuf = Buffer.from(swapTx, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([kp]);

  const sig = await conn.sendTransaction(tx, { skipPreflight: true, maxRetries: 3 });
  return sig;
}

// Venta: TOKEN -> SOL (percent 0–100). Requiere leer balance del mint del usuario.
export async function sellToken({ buyTxSignature, mintAddress, percent }) {
  if (PAPER) return `MOCK_SELL_${Date.now()}`;

  const conn = getConn();
  const kp = getKeypair();

  // 1) Balance de token (en unidades del token, necesitamos amount exacto)
  const ata = (await import('@solana/spl-token')).getAssociatedTokenAddressSync(new PublicKey(mintAddress), kp.publicKey);
  const acc = await conn.getTokenAccountBalance(ata).catch(()=>null);
  const ui = Number(acc?.value?.uiAmount || 0);
  if (!ui) throw new Error('Balance del token = 0');

  // 2) Cantidad a vender
  const amountUi = ui * Math.max(0, Math.min(1, (percent||0)/100));

  // 3) Convertir a amount “Raw” según decimals
  const decimals = Number(acc?.value?.decimals || 9);
  const amountRaw = Math.floor(amountUi * 10 ** decimals);

  // 4) Quote TOKEN -> SOL
  const slippageBps = 100; // 1% para venta; podés parametrizar si querés
  const quote = await jupQuote({ inputMint: mintAddress, outputMint: SOL_MINT, amount: amountRaw, slippageBps });

  const swapResp = await jupSwap({ quoteResponse: quote, userPublicKey: kp.publicKey.toBase58() });
  const txBuf = Buffer.from(swapResp.swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([kp]);

  const sig = await conn.sendTransaction(tx, { skipPreflight: true, maxRetries: 3 });
  return sig;
}

export const phantomClient = { setPaperTrading, getSolBalance, buyToken, sellToken };
