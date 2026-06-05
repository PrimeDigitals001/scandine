"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyCredentials, requireSuperAdmin } from "./auth";
import {
  SUPERADMIN_COOKIE,
  SESSION_TTL_SECONDS,
  createSessionToken,
} from "./session";
import type { ActionState } from "./types";

// Note: a "use server" module may only export async functions, so ActionState
// lives in ./types (imported above), not here.

// ---- helpers (not exported) ------------------------------------------------

const opt = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50);
}

async function uniqueSlug(
  admin: ReturnType<typeof createAdminClient>,
  base: string,
): Promise<string> {
  const safeBase = base || "cafe";
  const { data } = await admin
    .from("restaurants")
    .select("slug")
    .like("slug", `${safeBase}%`);
  const taken = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  if (!taken.has(safeBase)) return safeBase;
  let i = 2;
  while (taken.has(`${safeBase}-${i}`)) i++;
  return `${safeBase}-${i}`;
}

// ---- auth ------------------------------------------------------------------

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  if (!(await verifyCredentials(email, password))) {
    return { error: "Invalid email or password." };
  }

  const token = await createSessionToken(email);
  const store = await cookies();
  store.set(SUPERADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  // best-effort audit log
  try {
    await createAdminClient().from("super_admin_sessions").insert({ ip_address: null });
  } catch {
    /* ignore */
  }

  redirect("/superadmin/dashboard");
}

export async function logoutAction(): Promise<void> {
  const store = await cookies();
  store.delete(SUPERADMIN_COOKIE);
  redirect("/login");
}

// ---- restaurants -----------------------------------------------------------

const restaurantSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
  subscription_plan: z.enum(["free", "starter", "pro"]).default("free"),
  pos_mode: z.enum(["standalone", "pos_integrated"]).default("standalone"),
});

export async function createRestaurant(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireSuperAdmin();

  const parsed = restaurantSchema.safeParse({
    name: formData.get("name"),
    subscription_plan: formData.get("subscription_plan") ?? "free",
    pos_mode: formData.get("pos_mode") ?? "standalone",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const googleUrl = opt(formData.get("google_review_url"));
  if (googleUrl && !/^https?:\/\//i.test(googleUrl)) {
    return { error: "Google review URL must start with http(s)://" };
  }

  const admin = createAdminClient();
  const slug = await uniqueSlug(admin, slugify(parsed.data.name));

  const { data, error } = await admin
    .from("restaurants")
    .insert({
      name: parsed.data.name,
      slug,
      address: opt(formData.get("address")),
      gst_number: opt(formData.get("gst_number")),
      google_review_url: googleUrl,
      subscription_plan: parsed.data.subscription_plan,
      pos_mode: parsed.data.pos_mode,
      onboarded_by: session.email ?? "Super Admin",
      onboarded_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !data) return { error: error?.message ?? "Could not create restaurant." };

  revalidatePath("/superadmin/restaurants");
  redirect(`/superadmin/restaurants/${data.id}`);
}

export async function toggleRestaurantActive(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("restaurant_id"));
  const next = formData.get("next") === "true";
  await createAdminClient().from("restaurants").update({ is_active: next }).eq("id", id);
  revalidatePath(`/superadmin/restaurants/${id}`);
  revalidatePath("/superadmin/restaurants");
}

// ---- tables ----------------------------------------------------------------

const addTablesSchema = z.object({
  count: z.coerce.number().int().min(1).max(50),
  prefix: z.string().trim().max(8).default("T"),
});

export async function addTables(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurant_id"));

  const parsed = addTablesSchema.safeParse({
    count: formData.get("count"),
    prefix: formData.get("prefix") || "T",
  });
  if (!parsed.success) return { error: "Enter a count between 1 and 50." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("tables")
    .select("table_number")
    .eq("restaurant_id", restaurantId);
  const start = (existing?.length ?? 0) + 1;
  const prefix = parsed.data.prefix || "T";

  const rows = Array.from({ length: parsed.data.count }, (_, i) => ({
    restaurant_id: restaurantId,
    table_number: `${prefix}${start + i}`,
  }));

  const { error } = await admin.from("tables").insert(rows);
  if (error) return { error: error.message };

  revalidatePath(`/superadmin/restaurants/${restaurantId}`);
  return { ok: true };
}

export async function deleteTable(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const tableId = String(formData.get("table_id"));
  const restaurantId = String(formData.get("restaurant_id"));
  await createAdminClient().from("tables").delete().eq("id", tableId);
  revalidatePath(`/superadmin/restaurants/${restaurantId}`);
}

// ---- restaurant admin accounts (Supabase Auth users) -----------------------

const adminAccountSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  full_name: z.string().trim().max(120).optional(),
});

export async function createAdminAccount(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();
  const restaurantId = String(formData.get("restaurant_id"));

  const parsed = adminAccountSchema.safeParse({
    email: formData.get("email"),
    full_name: opt(formData.get("full_name")) ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const admin = createAdminClient();
  const tempPassword = `Cafe-${randomBytes(4).toString("hex")}`;

  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email: parsed.data.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name ?? null },
  });
  if (cErr || !created.user) {
    return { error: cErr?.message ?? "Could not create the login." };
  }

  const { error: pErr } = await admin.from("profiles").insert({
    id: created.user.id,
    restaurant_id: restaurantId,
    role: "admin",
    full_name: parsed.data.full_name ?? null,
  });
  if (pErr) {
    // avoid an orphaned auth user if the profile insert fails
    await admin.auth.admin.deleteUser(created.user.id);
    return { error: pErr.message };
  }

  revalidatePath(`/superadmin/restaurants/${restaurantId}`);
  return { ok: true, createdEmail: parsed.data.email, tempPassword };
}

export async function resetAdminPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();
  const userId = String(formData.get("user_id"));
  const restaurantId = String(formData.get("restaurant_id"));

  const admin = createAdminClient();
  const newPassword = `Cafe-${randomBytes(4).toString("hex")}`;
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: newPassword,
  });
  if (error) return { error: error.message };

  revalidatePath(`/superadmin/restaurants/${restaurantId}`);
  return { ok: true, tempPassword: newPassword, resetUserId: userId };
}
