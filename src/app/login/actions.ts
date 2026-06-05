"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { verifyCredentials } from "@/lib/superadmin/auth";
import {
  createSessionToken,
  SUPERADMIN_COOKIE,
  SESSION_TTL_SECONDS,
} from "@/lib/superadmin/session";
import type { LoginState } from "./types";

/**
 * One sign-in for everyone. Routes by identity:
 *   • the operator email (env)        → super admin   (custom JWT cookie)
 *   • a Supabase user with role=admin → admin dashboard
 *   • a Supabase user with role=staff → that café's kitchen display
 */
export async function unifiedLogin(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  // Super admin — separate hardcoded credential, never a Supabase user.
  const superEmail = (process.env.SUPER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  if (superEmail && email.toLowerCase() === superEmail) {
    if (await verifyCredentials(email, password)) {
      const token = await createSessionToken(email);
      const store = await cookies();
      store.set(SUPERADMIN_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: SESSION_TTL_SECONDS,
      });
      redirect("/superadmin/dashboard");
    }
    return { error: "Invalid email or password." };
  }

  // Restaurant owner / kitchen staff — Supabase Auth.
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Invalid email or password." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Invalid email or password." };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, restaurant_id, is_active")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.restaurant_id) {
    await supabase.auth.signOut();
    return { error: "This account isn't linked to a café yet." };
  }
  if (profile.is_active === false) {
    await supabase.auth.signOut();
    return { error: "This account has been disabled. Contact your café admin." };
  }

  if (profile.role === "admin") redirect("/admin/dashboard");

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("slug")
    .eq("id", profile.restaurant_id)
    .maybeSingle();
  redirect(`/kitchen/${restaurant?.slug ?? ""}`);
}
