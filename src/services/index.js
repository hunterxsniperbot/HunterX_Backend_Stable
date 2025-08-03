// src/services/index.js
import phantomClient from './phantom.js';
import quicknodeClient from './quicknode.js';
import { createClient } from '@supabase/supabase-js';

// Cliente de Supabase (reutilizable en todos los módulos)
const supabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export default {
  phantomClient,
  quicknodeClient,
  supabaseClient
};
