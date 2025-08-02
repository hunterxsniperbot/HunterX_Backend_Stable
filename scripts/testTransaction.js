// scripts/testTransaction.js

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { connection } from '../src/services/solana.js';
import bs58 from 'bs58';

async function testTransaction() {
  // 1) Decodifica tu clave secret en Base58
  if (!process.env.PHANTOM_SECRET_KEY) {
    console.error('❌ Falta PHANTOM_SECRET_KEY en .env');
    process.exit(1);
  }
  const secretKey = bs58.decode(process.env.PHANTOM_SECRET_KEY.trim());
  const wallet = Keypair.fromSecretKey(secretKey);
  console.log('🔑 Wallet public key:', wallet.publicKey.toString());

  // ── PRUEBA EN DEVNET: Solicita airdrop de 1 SOL ───────────────────
  console.log('🌧️ Solicitando airdrop de 1 SOL en Devnet…');
  const airdropSig = await connection.requestAirdrop(
    wallet.publicKey,
    1e9 // 1 SOL = 1 000 000 000 lamports
  );
  await connection.confirmTransaction(airdropSig, 'confirmed');
  console.log('🎉 Airdrop recibido');

  // ── CONSTRUIR Y ENVIAR TRANSACCIÓN DE PRUEBA ───────────────────────
  // Transferirte 1 lamport (para validar firma/envío)
  const instruction = SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: wallet.publicKey,
    lamports: 1,
  });
  const tx = new Transaction().add(instruction);

  // Configura el feePayer y blockhash
  tx.feePayer = wallet.publicKey;
  const { blockhash } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;

  // Firma y envía
  tx.sign(wallet);
  const rawTx = tx.serialize();
  const signature = await connection.sendRawTransaction(rawTx);
  console.log('📤 Signature:', signature);

  // Espera confirmación
  await connection.confirmTransaction(signature, 'confirmed');
  console.log('✅ Transacción confirmada');
}

testTransaction().catch(err => {
  console.error('❌ Error en testTransaction:', err);
  process.exit(1);
});
