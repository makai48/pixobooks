// .env: VITE_SUPABASE_URL=https://your-project.supabase.co
//       VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... (preferred)
//       VITE_SUPABASE_ANON_KEY=... (legacy fallback)
// See .env.example — never commit .env (see .gitignore).
import { createClient } from "@supabase/supabase-js";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
export const SUPABASE_KEY =
  (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ||
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined);

if (!SUPABASE_URL || !SUPABASE_KEY) {
  // Fail fast with a clear message instead of createClient(undefined, undefined).
  throw new Error("[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — check .env (see .env.example)");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: "pkce" },
  realtime: { params: { eventsPerSecond: 10 } },
});
