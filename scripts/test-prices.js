import { getPriceWithSource, MINTS, _clearPriceCache } from '../src/services/prices.js';

const mint = process.argv[2] || MINTS.WSOL;

(async ()=>{
  try{
    console.log('Mint:', mint);
    let a = await getPriceWithSource(mint);
    console.log('First:', a);
    let b = await getPriceWithSource(mint); // debe salir de caché
    console.log('Cached:', b);
    _clearPriceCache();
    let c = await getPriceWithSource(mint); // nuevo fetch
    console.log('After clear:', c);
  }catch(e){
    console.error('❌', e.message || e);
    process.exit(1);
  }
})();
