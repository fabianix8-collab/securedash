import { createClient } from "@supabase/supabase-js";

// Estas variables son PUBLICAS por diseño (anon key): Supabase las protege
// con Row Level Security (ver supabase/schema.sql), no escondiendolas.
// Se configuran en .env.local (ver .env.example) y NUNCA deben ser la
// service_role key.
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
