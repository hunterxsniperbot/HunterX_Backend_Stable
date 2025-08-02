// scripts/testSupabase.js

import 'dotenv/config';
import { supabase } from '../src/services/supabase.js';

async function testSupabase() {
  // Ejecuta la consulta a la tabla "trades"
  const { data, error } = await supabase
    .from('trades')
    .select('*');

  if (error) {
    console.error('❌ Error al consultar trades:', error);
    process.exit(1);
  }

  console.log('✅ Trades obtenidos:', data);
}

testSupabase();
