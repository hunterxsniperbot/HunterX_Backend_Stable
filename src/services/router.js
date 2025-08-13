import { Connection, Keypair, VersionedTransaction, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { getJson } from './http.js';

const RPC = process.env.QUICKNODE_RPC_URL || '';
const USDC = 'EPjFWdd5Au1Y8Wv...kX'; // USDC mainnet (recortado)
const SLIPPAGE_BPS = Number(process.env.JUPITER_SLIPPAGE_BPS || 80);
const PRIORITY_FEE = Number(process.env.PRIORITY_FEE_MICRO_LAMPORTS || 0);

function conn(){ if(!RPC) throw new Error('RPC no configurado'); return new Connection(RPC, 'confirmed'); }

async function getDecimals(mint){
  const c = conn();
  const r = await c.getTokenSupply(new PublicKey(mint));
  const d = Number(r?.value?.decimals);
  if (!Number.isFinite(d)) throw new Error('decimals?');
  return d;
}

export async function sellPercent({ mintIn, qtyOpen, pct = 100 }){
  const sk = process.env.TRADING_SECRET_KEY || '';
  if (!sk) throw new Error('TRADING_SECRET_KEY no configurada');
  const kp = Keypair.fromSecretKey(bs58.decode(sk));
  const c  = conn();

  const dec = await getDecimals(mintIn);
  const qtyToSell = qtyOpen * (Math.min(100,Math.max(1,pct))/100);
  const amountBaseUnits = Math.floor(qtyToSell * (10 ** dec));
  if (amountBaseUnits <= 0) throw new Error('amount=0');

  const quote = await getJson(`https://quote-api.jup.ag/v6/quote?inputMint=${mintIn}&outputMint=${USDC}&amount=${amountBaseUnits}&slippageBps=${SLIPPAGE_BPS}`, { timeout: 6000 });
  if (!quote?.routePlan?.length) throw new Error('sin ruta');

  const swap = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'content-type':'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: kp.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      computeUnitPriceMicroLamports: PRIORITY_FEE || undefined,
    })
  }).then(r=>r.json());
  if (!swap?.swapTransaction) throw new Error('swap tx vacío');

  const tx = VersionedTransaction.deserialize(Buffer.from(swap.swapTransaction, 'base64'));
  tx.sign([kp]);
  const sig = await c.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 3 });
  await c.confirmTransaction(sig, 'confirmed');
  return { signature: sig };
}
