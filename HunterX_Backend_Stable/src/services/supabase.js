// src/services/supabase.js

// Importa la librería para leer .env
import 'dotenv/config';

// Importa el cliente de Supabase
import { createClient } from '@supabase/supabase-js';

// Lee URL y KEY de tus variables de entorno
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// Si falta alguno, detenemos la ejecución con un mensaje claro
if (!supabaseUrl || !supabaseKey) {
  throw new Error('❌ Error: Define SUPABASE_URL y SUPABASE_KEY en tu archivo .env');
}

// Crea y exporta el cliente de Supabase
export const supabase = createClient(supabaseUrl, supabaseKey);
