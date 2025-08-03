// index.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import startBot from './bot.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function main() {
  console.log('🔌 Probando Supabase…');
  const { data, error } = await supabase.from('test').select('*').limit(1);
  if (error) {
    console.error('❌ Error Supabase:', error.message);
  } else {
    console.log('✅ Supabase OK:', data);
  }

  console.log('🔧 Iniciando bot…');
  await startBot();
}

main().catch(err => {
  console.error('❌ Error en main:', err);
  process.exit(1);
});
