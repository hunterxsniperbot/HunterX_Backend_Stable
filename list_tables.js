// list_tables.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function listTables() {
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_schema', 'public');

  if (error) {
    console.error('❌ Error al listar tablas:', error);
    process.exit(1);
  }
  console.log('📋 Tablas en el esquema public:');
  data.forEach(r => console.log('-', r.table_name));
}

listTables();
