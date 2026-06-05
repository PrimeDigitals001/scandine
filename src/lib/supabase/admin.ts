import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

/**
 * SERVICE-ROLE client — bypasses RLS. The `server-only` import above makes the
 * build fail if this module is ever imported into client code, so the secret
 * key can never reach the browser. Use ONLY in Route Handlers / Server Actions
 * for super-admin work and other privileged server operations (CLAUDE.md §8).
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
