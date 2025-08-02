// validateEnv.js
require('dotenv').config();

const requiredVars = [
  'SUPABASE_URL',
  'SUPABASE_KEY',
  'TELEGRAM_TOKEN',
  'QUICKNODE_URL',
  'PHANTOM_SECRET_KEY',
  'GOOGLE_SHEETS_ID'
];

let allOK = true;

for (const key of requiredVars) {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    console.error(`❌ Falta la variable: ${key}`);
    allOK = false;
  } else {
    console.log(`✅ ${key} cargada`);
  }
}

if (!allOK) {
  console.error('\n⛔ Archivos .env incompletos. Corrige los errores antes de continuar.');
  process.exit(1);
} else {
  console.log('\n🎉 Todas las variables están correctamente configuradas.');
}
