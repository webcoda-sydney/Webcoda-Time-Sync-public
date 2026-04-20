import { createClient } from "@supabase/supabase-js";
import { getEnv } from "./env.js";

let supabaseClient = null;

export function getSupabaseClient() {
  if (!supabaseClient) {
    const env = getEnv();
    supabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  return supabaseClient;
}
