// test_quicknode.js
import 'dotenv/config';
import QuickNodeService from './src/services/quicknode.js';

async function main() {
  try {
    const rpcUrl = process.env.QUICKNODE_RPC_URL;
    console.log('RPC URL →', rpcUrl);

    const client = QuickNodeService({ rpcUrl });
    console.log('Escaneando nuevos tokens…');
    const tokens = await client.scanNewTokens();

    console.log(`✅ Encontrados ${tokens.length} tokens:`);
    // Muestra los primeros 5
    tokens.slice(0, 5).forEach((t, i) => {
      console.log(`${i + 1}. ${t.symbol} → mint: ${t.mintAddress}`);
      console.log(`   Edad (ts): ${t.launchTimestamp}`);
      console.log(`   Liquidez: ${t.metrics.liquidity}`);
      console.log(`   FDV:       ${t.metrics.fdv}`);
      console.log(`   Holders:   ${t.metrics.holders}`);
      console.log(`   Volumen:   ${t.metrics.volume}`);
    });
  } catch (e) {
    console.error('❌ Error en test_quicknode:', e);
    process.exit(1);
  }
}

main();
