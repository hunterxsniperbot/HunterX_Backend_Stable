// src/services/phantom.js
import bs58 from 'bs58';
import fetch from 'node-fetch';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

/**
 * Servicio Phantom para conectar con tu wallet y Supabase.
 * - privateKeyBase58: tu clave privada en Base58 (32 o 64 bytes)
 * - rpcUrl: URL de QuickNode
 * - supabaseClient: cliente de Supabase ya inicializado
 */
export default function PhantomService({ privateKeyBase58, rpcUrl, supabaseClient }) {
  // 1) Conexión a la RPC
  const connection = new Connection(rpcUrl, 'confirmed');

  // 2) Decodifica tu clave Base58
  const decoded = bs58.decode(privateKeyBase58);
  let keypair;
  if (decoded.length === 32) {
    keypair = Keypair.fromSeed(decoded);
  } else if (decoded.length === 64) {
    keypair = Keypair.fromSecretKey(decoded);
  } else {
    throw new Error(`Clave Base58 inválida: ${decoded.length} bytes`);
  }

  const publicKey = keypair.publicKey;

  return {
    // Health check: comprueba que tu wallet responde
    healthCheck: async () => {
      try {
        await connection.getBalance(publicKey);
        return true;
      } catch (err) {
        throw new Error(`Phantom health error: ${err.message}`);
      }
    },

    // Obtener balance USD aproximado (sol * precio SOL/USD desde CoinGecko)
    getBalanceUsd: async () => {
      const lamports = await connection.getBalance(publicKey);
      const sol = lamports / 1e9;
      try {
        const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
        const json = await res.json();
        const priceUsd = json.solana.usd;
        return sol * priceUsd;
      } catch {
        return sol * 20; // fallback
      }
    },

    // Compra de token (stub: reemplaza por tu lógica on-chain)
    buyToken: async ({ mintAddress, amount, slippage }) => {
      console.log(`Stub buyToken: comprando $${amount} de mint ${mintAddress}`);
      // aquí va tu envío de transacción real a Phantom/Serum/Jupiter...
      return `TX_BUY_${Date.now()}`;
    },

    // Venta de token (stub: reemplaza por tu lógica on-chain)
    sellToken: async ({ mintAddress, amount, slippage }) => {
      console.log(`Stub sellToken: vendiendo ${amount} de mint ${mintAddress}`);
      return `TX_SELL_${Date.now()}`;
    },

    /**
     * getOpenPositions: recupera todas las trades abiertas (pnl NULL)
     * y añade precio actual desde DexScreener
     */
    getOpenPositions: async (userId) => {
      const { data, error } = await supabaseClient
        .from('trades')
        .select('token,price,amount_usd,amount_token,tx_signature,pnl,created_at')
        .eq('user_id', userId)
        .is('pnl', null);

      if (error) throw new Error(`Error fetching open positions: ${error.message}`);

      // enriquecer con precio en vivo:
      return Promise.all(data.map(async r => {
        let currentPrice = parseFloat(r.price);
        try {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/solana/${r.tx_signature}`);
          if (res.ok) {
            const json = await res.json();
            const p = json.pairs?.[0]?.priceUsd;
            if (p) currentPrice = parseFloat(p);
          }
        } catch (_) { /* ignora */ }
        return {
          tokenSymbol:    r.token,
          tokenMint:      r.tx_signature,  // usamos tx_signature como ID único
          entryPrice:     parseFloat(r.price),
          amountUsd:      parseFloat(r.amount_usd),
          amountToken:    parseFloat(r.amount_token),
          buyTxSignature: r.tx_signature,
          pnl:            r.pnl,
          openedAt:       r.created_at,
          currentPrice
        };
      }));
    },

    /**
     * getPosition: recupera UNA posición usando tx_signature
     */
    getPosition: async (userId, txSignature) => {
      const { data, error } = await supabaseClient
        .from('trades')
        .select('token,price,amount_usd,amount_token,tx_signature,pnl,created_at')
        .eq('user_id', userId)
        .eq('tx_signature', txSignature)
        .single();

      if (error) throw new Error(`Error fetching position: ${error.message}`);
      return {
        tokenSymbol:    data.token,
        entryPrice:     parseFloat(data.price),
        amountUsd:      parseFloat(data.amount_usd),
        amountToken:    parseFloat(data.amount_token),
        buyTxSignature: data.tx_signature,
        pnl:            data.pnl,
        openedAt:       data.created_at,
        currentPrice:   null  // se rellenará en el handler cartera
      };
    }
  };
}
