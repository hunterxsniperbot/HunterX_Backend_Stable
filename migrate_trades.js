// migrate_trades.js
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function migrate() {
  const sql = `
    ALTER TABLE public.trades
    ADD COLUMN IF NOT EXISTS mint_address text;
  `;
  const { error } = await supabase.rpc('sql', { q: sql });
  if (error) {
    console.error('❌ Error al alterar tabla trades:', error);
    process.exit(1);
  }
  console.log('✅ Columna mint_address añadida (o ya existía)');
  process.exit(0);
}

migrate();
