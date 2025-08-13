// src/services/solana.js

// 1️⃣ Carga dotenv aquí mismo, antes de cualquier uso de process.env
import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// 2️⃣ Ahora importa lo demás
import { Connection, PublicKey } from '@solana/web3.js';

const rpcUrl = process.env.QUICKNODE_RPC_URL;
if (!rpcUrl) {
  throw new Error('Define QUICKNODE_RPC_URL en .env');
}

export const connection = new Connection(rpcUrl, 'confirmed');

/**
 * Obtiene el balance en SOL de una dirección.
 */
export async function getBalanceSOL(address) {
  const publicKey = new PublicKey(address);
  const lamports = await connection.getBalance(publicKey);
  return lamports / 1e9;
}
// src/services/solana.js — conexión singleton a Solana + helpers
import { Connection, PublicKey } from '@solana/web3.js';

let _conn = null;

export function getConnection() {
  if (_conn) return _conn;
  const url = process.env.QUICKNODE_URL;
  if (!url) throw new Error('QUICKNODE_URL no definido');
  _conn = new Connection(url, 'confirmed');
  return _conn;
}

export async function getSolBalance(address) {
  const conn = getConnection();
  const pub  = new PublicKey(address);
  const lam  = await conn.getBalance(pub);
  return lam / 1e9; // SOL
}

export function isValidSolAddress(s) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(s||''));
}
