import registerCandidatos from '../commands/candidatos.js';
export function wireCandidatos(bot){
  try {
    /* registerCandidatos(bot); (desde start.js ya lo hacemos) */
    console.log('🔌 wireCandidatos OK');
  } catch (e) {
    console.error('wireCandidatos error:', e?.message || e);
  }
}
