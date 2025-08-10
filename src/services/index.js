// src/services/index.js — normaliza exports para evitar "not a function"

import * as sheetsMod   from './sheets.js';
import * as quickMod    from './quicknode.js';
import * as phantomMod  from './phantom.js';
import * as supabaseMod from './supabase.js';

// Sheets (objeto con appendRow)
const sheetsClient    = sheetsMod.default   || sheetsMod;

// Supabase (objeto con upsertTrade/insertEvent/…)
const supabaseClient  = supabaseMod.default || supabaseMod;

// Phantom → asegurar { buyToken, sellToken }
const phantomBase = phantomMod.default || phantomMod;
const phantomClient = {
  buyToken : phantomBase.buyToken  || (async () => { throw new Error('phantom.buyToken no implementado'); }),
  sellToken: phantomBase.sellToken || (async () => { throw new Error('phantom.sellToken no implementado'); })
};

// QuickNode → asegurar { getPrice, scanNewTokens }
const qnBase = quickMod.default || quickMod;
const quickNodeClient = {
  getPrice     : qnBase.getPrice      || qnBase.price      || (async () => { throw new Error('quicknode.getPrice no implementado'); }),
  scanNewTokens: qnBase.scanNewTokens || qnBase.scan       || (async () => [])
};

export {
  sheetsClient,
  quickNodeClient,
  phantomClient,
  supabaseClient
};
