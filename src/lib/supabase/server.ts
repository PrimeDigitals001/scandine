import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

/**
 * Server (anon) Supabase client bound to the request cookies, for Server
 * Components, Route Handlers, and Server Actions. Still RLS-constrained — it
 * acts as the logged-in user (or anon). For privileged work use admin.ts.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // Throws in a Server Component render (read-only cookies); the
          // middleware refresh handles writes, so swallowing here is correct.
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            /* called from a Server Component — safe to ignore */
          }
        },
      },
    },
  );
}
