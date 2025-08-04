// keyconvert.js
import bs58 from 'bs58';

// Reemplaza esta cadena con tu clave privada Base58 actual
const secretBase58 = 'TU_CLAVE_PRIVADA_BASE58_AQUÍ';

// Decodifica a Uint8Array y luego a Array normal de números
const arr = Array.from(bs58.decode(secretBase58));

// Imprime el JSON que vas a usar en PHANTOM_PRIVATE_KEY_JSON
console.log(JSON.stringify(arr));
