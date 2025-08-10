// test_price.js
import { quickNodeClient } from './src/services/index.js';

(async () => {
  try {
    const mint = 'So1aNaBoMb11111111111111111111111111111';
    const price = await quickNodeClient.getPrice(mint);
    console.log('🧪 Resultado getPrice:', price);
  } catch (err) {
    console.error('🧪 Error en test_price.js:', err);
  }
})();
