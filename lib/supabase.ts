import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Optional Supabase — persists the brief cache + feedback so the deployed URL survives cold starts.
// All calls are server-side (API routes), so we prefer the SECRET key (bypasses RLS, more secure)
// and fall back to the publishable key. Falls back to files entirely if not configured / on error.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;
