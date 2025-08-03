// src/services/index.js
import { createClient }    from '@supabase/supabase-js';
import QuickNodeService    from './quicknode.js';
import PhantomService      from './phantom.js';
import SheetsService       from './sheets.js';

export const supabaseClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

export const quickNodeClient = QuickNodeService({
  rpcUrl: process.env.QUICKNODE_RPC_URL
});

export const phantomClient = PhantomService({
  privateKeyBase58: process.env.PHANTOM_PRIVATE_KEY,
  rpcUrl:           process.env.QUICKNODE_RPC_URL,
  supabaseClient   // aquí lo pasamos
});

export const sheetsClient = SheetsService({
  credentialsPath: process.env.GOOGLE_SHEETS_CREDENTIALS,
  sheetId:         process.env.GOOGLE_SHEETS_ID
});
