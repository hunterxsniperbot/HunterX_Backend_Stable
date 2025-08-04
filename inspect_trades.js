// inspect_trades.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

// Inicializa Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function inspect() {
  const tableName = 'trades';   // tu tabla de operaciones

  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(1);

  if (error) {
    console.error('❌ Error al inspeccionar', tableName, error);
    process.exit(1);
  }
  console.log(`🔍 Primera fila de "${tableName}":`, data[0]);
  console.log(`🔑 Columnas en "${tableName}":`, Object.keys(data[0]));
}

inspect();
