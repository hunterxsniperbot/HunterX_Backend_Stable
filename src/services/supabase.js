// src/services/supabase.js (ESM) — real + fallback stub correcto
// Requiere (para modo real):
//   SUPABASE_URL, SUPABASE_KEY
// Opcionales:
//   SUPABASE_TABLE_TRADES=trades
//   SUPABASE_TABLE_EVENTS=events

import { createClient } from '@supabase/supabase-js';

const URL  = process.env.SUPABASE_URL || '';
const KEY  = process.env.SUPABASE_KEY || '';
const T_TR = process.env.SUPABASE_TABLE_TRADES || 'trades';
const T_EV = process.env.SUPABASE_TABLE_EVENTS || 'events';

const hasCreds = !!URL && !!KEY;

// ---------- STUB seguro (si faltan envs) ----------
const stub = {
  async upsertTrade(row) {
    console.log('[SupabaseStub] upsertTrade →', row?.type || 'trade');
    return { data: null, error: null };
  },
  async insertEvent(evt) {
    console.log('[SupabaseStub] insertEvent →', evt?.type || 'event');
    return { data: null, error: null };
  },
  async getOpenPositions(userId) {
    console.log('[SupabaseStub] getOpenPositions →', userId);
    return { data: [], error: null };
  },
  async closePosition(userId, txSignature) {
    console.log('[SupabaseStub] closePosition →', userId, txSignature);
    return { data: null, error: null };
  },
};

let supabaseClient = stub;

if (!hasCreds) {
  console.warn('[Supabase] Faltan SUPABASE_URL/SUPABASE_KEY — usando STUB.');
} else {
  // ---------- Cliente real ----------
  const supabase = createClient(URL, KEY, {
    auth: { persistSession: false },
  });

  function clean(obj) {
    const out = {};
    for (const k of Object.keys(obj || {})) {
      if (obj[k] !== undefined) out[k] = obj[k];
    }
    return out;
  }

  async function upsertTrade(row) {
    const payload = clean(row);
    const { data, error } = await supabase
      .from(T_TR)
      .upsert(payload, { onConflict: 'tx' }) // si tu tabla no tiene 'tx' único, igual insertará
      .select();
    if (error) {
      console.error('[Supabase] upsertTrade error:', error.message);
      return { data: null, error };
    }
    return { data, error: null };
  }

  async function insertEvent(evt) {
    const payload = clean(evt);
    const { data, error } = await supabase
      .from(T_EV)
      .insert(payload)
      .select();
    if (error) {
      console.error('[Supabase] insertEvent error:', error.message);
      return { data: null, error };
    }
    return { data, error: null };
  }

  async function getOpenPositions(userId) {
    const { data, error } = await supabase
      .from(T_TR)
      .select('*')
      .eq('user_id', String(userId))
      .in('type', ['BUY'])
      .order('fecha_hora', { ascending: false })
      .limit(100);
    if (error) {
      console.error('[Supabase] getOpenPositions error:', error.message);
      return { data: [], error };
    }
    return { data: data || [], error: null };
  }

  async function closePosition(userId, txSignature) {
    return insertEvent({
      type: 'close_position',
      user_id: String(userId),
      msg: `close by tx=${txSignature}`,
      created_at_iso: new Date().toISOString()
    });
  }

  supabaseClient = {
    upsertTrade,
    insertEvent,
    getOpenPositions,
    closePosition
  };
}

export default supabaseClient;
