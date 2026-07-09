import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Optional Supabase — persists the brief cache + feedback so the deployed URL survives cold starts.
// Falls back to files if not configured or if a call fails, so nothing ever breaks.
export const supabase: SupabaseClient | null =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    : null;
