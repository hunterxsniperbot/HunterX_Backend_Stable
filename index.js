require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

(async () => {
  console.log('🔌 Probando Supabase…');
  const { data, error } = await supabase.from('test').select('*').limit(1);

  if (error) {
    console.error('❌ Error Supabase:', error.message);
  } else {
    console.log('✅ Supabase OK:', data);
  }

  // Iniciar bot
  console.log('🔧 Cargando bot.js…');
  require('./bot');
})();
