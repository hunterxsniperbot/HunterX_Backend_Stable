// src/services/phantom.js
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch'; // si te falta, npm install node-fetch

/**
 * Servicio Phantom Wallet y posiciones.
 * Se basa en:
 * - `privateKeyBase58` para firmar transacciones (compras/ventas)
 * - `rpcUrl` para conectarse a Solana
 * - `supabaseClient` inyectable para leer/escribir trades
 */
export default function PhantomService({ privateKeyBase58, rpcUrl, supabaseClient }) {
  const connection = new Connection(rpcUrl, 'confirmed');
  const keypair   = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
  const publicKey = keypair.publicKey;

  return {
    // 1) Health check
    healthCheck: async () => {
      await connection.getBalance(publicKey);
      return true;
    },

    // 2) Obtener balance en USD (usa CoinGecko como placeholder)
    getBalanceUsd: async () => {
      const lamports = await connection.getBalance(publicKey);
      const sol = lamports / 1e9;
      // Llamada rápida a CoinGecko API para precio SOL
      const resp = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const json = await resp.json();
      const priceUsd = json.solana.usd;
      return sol * priceUsd;
    },

    // 3) Compraventa stub (tú lo implementarás con @solana/web3.js + Serum/Jupiter)
    buyToken: async ({ mint, amount, slippage }) => {
      console.log(`Stub buyToken: comprando $${amount} de mint ${mint}`);
      // Aquí iría la lógica real de transacción...
      return `TX_BUY_${Date.now()}`;
    },
    sellToken: async ({ mint, amount, slippage }) => {
      console.log(`Stub sellToken: vendiendo ${amount.toFixed(4)} tokens de mint ${mint}`);
      return `TX_SELL_${Date.now()}`;
    },

    // 4) Leer posiciones abiertas desde Supabase
    getOpenPositions: async (userId) => {
      const { data, error } = await supabaseClient
        .from('trades')
        .select(`
          user_id,
          token_symbol,
          token_mint,
          entry_price,
          amount_usd,
          buy_tx_signature
        `)
        .eq('user_id', userId)
        .eq('status', 'open');
      if (error) throw error;
      // Normalizar los nombres de campo al pos esperado
      return data.map(r => ({
        tokenSymbol:      r.token_symbol,
        tokenMint:        r.token_mint,
        entryPrice:       parseFloat(r.entry_price),
        amountUsd:        parseFloat(r.amount_usd),
        buyTxSignature:   r.buy_tx_signature,
        currentPrice:     null,     // opcional, lo puedes rellenar con QuickNode
        amountToken:      r.amount_usd / parseFloat(r.entry_price)
      }));
    },

    // 5) Leer una posición en concreto
    getPosition: async (userId, tokenMint) => {
      const { data, error } = await supabaseClient
        .from('trades')
        .select(`
          user_id,
          token_symbol,
          token_mint,
          entry_price,
          amount_usd,
          buy_tx_signature
        `)
        .eq('user_id', userId)
        .eq('token_mint', tokenMint)
        .eq('status', 'open')
        .limit(1)
        .single();
      if (error) throw error;
      return {
        tokenSymbol:    data.token_symbol,
        tokenMint:      data.token_mint,
        entryPrice:     parseFloat(data.entry_price),
        amountUsd:      parseFloat(data.amount_usd),
        buyTxSignature: data.buy_tx_signature,
        currentPrice:   null,
        amountToken:    data.amount_usd / parseFloat(data.entry_price)
      };
    },

    // 6) Balance estructurado para /cartera
    getWalletBalance: async (userId) => {
      const balanceUsd = await this.getBalanceUsd();
      // Sumar invertido (opc: suma trades abiertas)
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
