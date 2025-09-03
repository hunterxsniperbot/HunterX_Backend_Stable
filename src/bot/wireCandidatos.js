import registerCandidatos from '../commands/candidatos.js';
export function wireCandidatos(bot){
  try {
    registerCandidatos(bot);
    console.log('🔌 wireCandidatos OK');
  } catch (e) {
    console.error('wireCandidatos error:', e?.message || e);
  }
}
