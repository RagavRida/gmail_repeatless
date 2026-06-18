import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

let supabase = null;

export function getSupabase() {
  if (!supabase) {
    supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return supabase;
}
