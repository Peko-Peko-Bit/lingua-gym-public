import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Singleton client — safe for both client-side and server-side (Edge Functions)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
