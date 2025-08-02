// src/services/phantom.js
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

export default function PhantomService({ privateKeyBase58, rpcUrl }) {
  const connection = new Connection(rpcUrl);
  const secretKey = bs58.decode(privateKeyBase58);
  const keypair = Keypair.fromSecretKey(secretKey);

  return {
    healthCheck: async () => {
      await connection.getBalance(keypair.publicKey);
      return true;
    },

    /**
     * Stub de compra: simula enviar tx y devuelve una firma falsa.
     */
    buyToken: async ({ mint, amountUsd }) => {
      console.log(`Comprando ${amountUsd}$ de ${mint}…`);
      // Aquí construirías y enviarías la transacción real
      return `TX_${Date.now()}`;
    }
  };
}
