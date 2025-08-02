// index.js

// 1) Carga variables de entorno (.env)
import 'dotenv/config';

// 2) Importa tu cliente de Supabase
import 'dotenv/config';
import { supabase } from './src/services/supabase.js';

console.log('SUPABASE_URL=', process.env.SUPABASE_URL);
console.log('SUPABASE_KEY=', process.env.SUPABASE_KEY && '********');

// … resto de tu main()
  // Prueba rápida: cuenta cuántos registros hay en la tabla trades
  const { count, error } = await supabase
    .from('trades')
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error('❌ Error al contar trades:', error.message);
    process.exit(1);
  }

  console.log(`✅ Conexión exitosa a Supabase. Trades registrados: ${count}`);
  // Aquí puedes seguir arrancando QuickNode, Phantom, etc.
}

main();
