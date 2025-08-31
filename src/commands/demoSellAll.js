// src/commands/demoSellAll.js
import { sellAllDemo, getState } from '../services/demoBank.js';

const price = Number(process.argv[2] || 120); // precio salida simulado
const token = process.argv[3] || 'SOL';

const r = sellAllDemo({ token, priceUsd: price, reason: 'test' });
console.log('Vendido', token, 'realizado USD:', r.realizedUsd);
console.log('State:', getState());
