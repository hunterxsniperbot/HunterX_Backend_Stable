// scripts/testSolana.js

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { getBalanceSOL } from '../src/services/solana.js';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

async function testSolana() {
  if (!process.env.PHANTOM_SECRET_KEY) {
    console.error('❌ Falta PHANTOM_SECRET_KEY en .env');
    process.exit(1);
  }

  let secretKey;
  try {
    secretKey = bs58.decode(process.env.PHANTOM_SECRET_KEY.trim());
  } catch (err) {
    console.error('❌ Error al decodificar PHANTOM_SECRET_KEY Base58:', err.message);
    process.exit(1);
  }

  const keypair = Keypair.fromSecretKey(secretKey);
  console.log('🔑 Wallet public key:', keypair.publicKey.toString());

  const balance = await getBalanceSOL(keypair.publicKey.toString());
  console.log('✅ Balance de wallet:', balance, 'SOL');
}

testSolana();
