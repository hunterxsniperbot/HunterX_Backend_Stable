// src/services/phantom.js
import bs58 from 'bs58';
import fetch from 'node-fetch';
import { Connection, Keypair } from '@solana/web3.js';

export default function PhantomService({ privateKeyBase58, rpcUrl, supabaseClient }) {
  // 1) Conexión RPC
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

  return {
    /** Health check simple */
    healthCheck: async () => {
      // opcional: intenta obtener balance
      await connection.getBalance(keypair.publicKey);
      return true;
    },

    /** Stub de compra */
    buyToken: async ({ mintAddress, amountUsd, slippage }) => {
      console.log(`Stub buyToken: comprando $${amountUsd} de mint ${mintAddress} con slippage ${slippage}%`);
      // Aquí pondrías la lógica real de Phantom/DEX
      // Por ahora simulamos un TX:
      return `TX_BUY_${Date.now()}`;
    },

    /** Stub de venta */
    sellToken: async ({ buyTxSignature, percent }) => {
      console.log(`Stub sellToken: vendiendo ${percent}% de tx ${buyTxSignature}`);
      // Simula un TX de venta parcial
      return `TX_SELL_${Date.now()}`;
    },

    /** Recupera posiciones abiertas de Supabase */
    getOpenPositions: async (userId) => {
      const { data, error } = await supabaseClient
        .from('trades')
        .select('token,price,amount_usd,amount_token,tx_signature,pnl,created_at,exit_at,exit_price,exit_signature')
        .eq('user_id', userId)
        .is('pnl', null);

      if (error) throw new Error(`Error fetching open positions: ${error.message}`);

      // Enriquecer con precio en vivo (si quieres)
      return await Promise.all(data.map(async r => {
        let currentPrice = null;
        try {
          const res = await fetch(`https://api.dexscreener.com/latest/dex/solana/${r.token}`);
          const json = await res.json();
          currentPrice = parseFloat(json.pairs[0].priceUsd);
        } catch {
          // si falla, lo dejamos null
        }
        return {
          tokenSymbol:    r.token,
          tokenMint:      r.token,
          entryPrice:     parseFloat(r.price),
          amountUsd:      parseFloat(r.amount_usd),
          amountToken:    parseFloat(r.amount_token),
          buyTxSignature: r.tx_signature,
          pnl:            r.pnl,
          openedAt:       r.created_at,
          currentPrice,
          exitAt:         r.exit_at,
          exitPrice:      r.exit_price,
          exitSignature:  r.exit_signature
        };
      }));
    },

    /** Obtiene una posición individual */
    getPosition: async (userId, buyTxSignature) => {
      const { data, error } = await supabaseClient
        .from('trades')
        .select('token,price,amount_usd,amount_token,tx_signature,pnl,created_at,exit_at,exit_price,exit_signature')
        .eq('user_id', userId)
        .eq('tx_signature', buyTxSignature)
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
        currentPrice:   null,  // si quieres, puedes fetch DexScreener aquí
        exitAt:         data.exit_at,
        exitPrice:      data.exit_price,
        exitSignature:  data.exit_signature
      };
    }
  };
}
