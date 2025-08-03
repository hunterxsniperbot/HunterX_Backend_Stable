// src/services/phantom.js
import bs58 from 'bs58';
import fetch from 'node-fetch';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';

/**
 * Servicio Phantom Wallet y posiciones.
 * Usa tu clave privada Base58 desde PHANTOM_PRIVATE_KEY.
 */
export default function PhantomService({ privateKeyBase58, rpcUrl, supabaseClient }) {
  const connection = new Connection(rpcUrl, 'confirmed');

  // Decodifica la clave privada Base58
  const secretKey = bs58.decode(privateKeyBase58);
  if (secretKey.length !== 64) {
    throw new Error('Clave privada Base58 inválida (debe ser 64 bytes)');
  }
  const keypair   = Keypair.fromSecretKey(secretKey);
  const publicKey = keypair.publicKey;

  return {
    // Health check simple
    healthCheck: async () => {
      await connection.getBalance(publicKey);
      return true;
    },

    // Balance en USD (usa CoinGecko)
    getBalanceUsd: async () => {
      const lamports = await connection.getBalance(publicKey);
      const sol       = lamports / 1e9;
      const resp      = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const json      = await resp.json();
      return sol * json.solana.usd;
    },

    // Stubs de compra/venta (reemplaza con tu lógica)
    buyToken: async ({ mint, amount, slippage }) => {
      console.log(`Stub buyToken: comprando $${amount} de mint ${mint}`);
      return `TX_BUY_${Date.now()}`;
    },
    sellToken: async ({ mint, amount, slippage }) => {
      console.log(`Stub sellToken: vendiendo ${amount.toFixed(4)} tokens de mint ${mint}`);
      return `TX_SELL_${Date.now()}`;
    },

    // Posiciones abiertas desde Supabase
    getOpenPositions: async (userId) => {
      const { data, error } = await supabaseClient
        .from('trades')
        .select('user_id,symbol,mint_address,price_entry,amount_usd,buy_signature')
        .eq('user_id', userId)
        .eq('status', 'open');
      if (error) throw error;
      return data.map(r => ({
        tokenSymbol:    r.symbol,
        tokenMint:      r.mint_address,
        entryPrice:     parseFloat(r.price_entry),
        amountUsd:      parseFloat(r.amount_usd),
        buyTxSignature: r.buy_signature,
        currentPrice:   null,
        amountToken:    parseFloat(r.amount_usd) / parseFloat(r.price_entry)
      }));
    },

    // Una posición
    getPosition: async (userId, tokenMint) => {
      const { data, error } = await supabaseClient
        .from('trades')
        .select('symbol,mint_address,price_entry,amount_usd,buy_signature')
        .eq('user_id', userId)
        .eq('mint_address', tokenMint)
        .eq('status', 'open')
        .single();
      if (error) throw error;
      return {
        tokenSymbol:    data.symbol,
        tokenMint:      data.mint_address,
        entryPrice:     parseFloat(data.price_entry),
        amountUsd:      parseFloat(data.amount_usd),
        buyTxSignature: data.buy_signature,
        currentPrice:   null,
        amountToken:    parseFloat(data.amount_usd) / parseFloat(data.price_entry)
      };
    },

    // Balance estructurado
    getWalletBalance: async (userId) => {
      const balanceUsd = await this.getBalanceUsd();
      const { data, error } = await supabaseClient
        .from('trades')
        .select('amount_usd')
        .eq('user_id', userId)
        .eq('status', 'open');
      if (error) throw error;
      const investedUsd = data.reduce((sum, r) => sum + parseFloat(r.amount_usd), 0);
      return {
        totalUsd:    balanceUsd.toFixed(2),
        investedUsd: investedUsd.toFixed(2),
        freeUsd:     (balanceUsd - investedUsd).toFixed(2)
      };
    }
  };
}
