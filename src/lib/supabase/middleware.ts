import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

/**
 * Refresh the Supabase auth session on every request so Server Components
 * always see a valid token. Route protection (redirecting /admin, /kitchen,
 * /superadmin) is layered on top of this in step 3, once auth exists.
 *
 * Guarded: if Supabase env vars aren't set yet, this is a no-op so the app
 * still runs before the project is configured.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { response, user: null };

  const supabase = createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: getUser() revalidates the token and triggers cookie refresh.
  // Do not run other code between createServerClient and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { response, user };
}
