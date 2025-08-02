// src/services/phantom.js
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import fetch from 'node-fetch';

/**
 * Servicio mínimo Phantom Wallet + utilidades
 * @param {{privateKeyBase58:string, rpcUrl:string}} opts
 */
export default function PhantomService({ privateKeyBase58, rpcUrl }) {
  // Conexión a Solana y keypair
  const connection = new Connection(rpcUrl);
  const secretKey = bs58.decode(privateKeyBase58);
  const keypair = Keypair.fromSecretKey(secretKey);

  return {
    /** Comprueba que la conexión y clave funcionan */
    healthCheck: async () => {
      await connection.getBalance(keypair.publicKey);
      return true;
    },

    /**
     * Envía una orden de compra de token (stub).
     * @param {{mint:string,amountUsd:number}} opts
     * @returns {Promise<string>} Tx signature simulada
     */
    buyToken: async ({ mint, amountUsd }) => {
      console.log(`Stub buyToken: comprando $${amountUsd} de mint ${mint}`);
      // Aquí montarías y enviarías la transacción real
      return `TX_${Date.now()}`; 
    },

    /**
     * Devuelve el balance en USD aproximado (SOL * precio USD).
     * @returns {Promise<number>}
     */
    getBalanceUsd: async () => {
      // 1) Balance en lamports → SOL
      const lamports = await connection.getBalance(keypair.publicKey);
      const sol = lamports / 1e9;

      // 2) Precio SOL→USD vía CoinGecko
      const res = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'
      );
      const json = await res.json();
      const priceUsd = json.solana?.usd ?? 0;
      return sol * priceUsd;
    }
  };
}
