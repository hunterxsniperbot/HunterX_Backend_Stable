// src/worker.js
import 'dotenv/config';
import { consumeTasks } from './services/queue.js';
import { startSniperProcess } from './sniper.js';

console.log('🏃 Worker started, waiting for tasks...');

consumeTasks('startSniper', async ({ userId, module }) => {
  console.log(`👉 Ejecutando sniper para usuario ${userId}, módulo ${module}`);
  try {
    await startSniperProcess(userId, module);
    console.log('🎯 Sniper completed');
  } catch (err) {
    console.error('❌ Error en sniper:', err);
  }
});
