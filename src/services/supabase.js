import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || "";
// acepta SUPABASE_KEY, SUPABASE_SERVICE_ROLE (recomendado) o SUPABASE_ANON_KEY
const key = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE || process.env.SUPABASE_ANON_KEY || "";

export const supabase = (url && key) ? createClient(url, key) : null;

export async function insertTradeClose(row){
  if (!supabase) throw new Error("Supabase no configurado");
  const { data, error } = await supabase.from("trades").insert([row]).select().single();
  if (error) throw error;
  return data;
}
