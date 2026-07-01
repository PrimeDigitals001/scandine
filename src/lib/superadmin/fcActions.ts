"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSuperAdmin } from "./auth";
import type { ActionState } from "./types";

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

async function uniqueCourtSlug(
  admin: ReturnType<typeof createAdminClient>,
  base: string,
): Promise<string> {
  const safe = base || "court";
  const { data } = await admin.from("food_courts").select("slug").like("slug", `${safe}%`);
  const taken = new Set((data ?? []).map((r: { slug: string }) => r.slug));
  if (!taken.has(safe)) return safe;
  let i = 2;
  while (taken.has(`${safe}-${i}`)) i++;
  return `${safe}-${i}`;
}

const courtSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters."),
});

export async function createFoodCourt(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();
  const parsed = courtSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const admin = createAdminClient();
  const slug = await uniqueCourtSlug(admin, slugify(parsed.data.name));
  const { data, error } = await admin
    .from("food_courts")
    .insert({ name: parsed.data.name, slug, address: opt(formData.get("address")) })
    .select("id")
    .single();
  if (error || !data) return { error: error?.message ?? "Could not create the food court." };
  revalidatePath("/superadmin/food-courts");
  redirect(`/superadmin/food-courts/${data.id}`);
}

export async function toggleFoodCourtActive(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const id = String(formData.get("court_id"));
  const next = formData.get("next") === "true";
  await createAdminClient().from("food_courts").update({ is_active: next }).eq("id", id);
  revalidatePath(`/superadmin/food-courts/${id}`);
  revalidatePath("/superadmin/food-courts");
}

export async function attachStoreToCourt(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const courtId = String(formData.get("court_id"));
  const restaurantId = String(formData.get("restaurant_id"));
  if (!restaurantId) return;
  await createAdminClient()
    .from("restaurants")
    .update({ food_court_id: courtId })
    .eq("id", restaurantId);
  revalidatePath(`/superadmin/food-courts/${courtId}`);
}

export async function detachStoreFromCourt(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const courtId = String(formData.get("court_id"));
  const restaurantId = String(formData.get("restaurant_id"));
  await createAdminClient()
    .from("restaurants")
    .update({ food_court_id: null })
    .eq("id", restaurantId);
  revalidatePath(`/superadmin/food-courts/${courtId}`);
}

// Shared-table access points (Phase 2 fulfillment); pickup uses the court token.
const seatsSchema = z.object({
  count: z.coerce.number().int().min(1).max(100),
  prefix: z.string().trim().max(8).default("Table "),
  capacity: z.coerce.number().int().min(1).max(30).default(4),
});

export async function addCourtTables(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireSuperAdmin();
  const courtId = String(formData.get("court_id"));
  const parsed = seatsSchema.safeParse({
    count: formData.get("count"),
    prefix: formData.get("prefix") || "Table ",
    capacity: formData.get("capacity") || 4,
  });
  if (!parsed.success) return { error: "Enter a count between 1 and 100." };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("food_court_tables")
    .select("id")
    .eq("food_court_id", courtId)
    .eq("mode", "shared_table");
  const start = (existing?.length ?? 0) + 1;
  const prefix = parsed.data.prefix || "Table ";
  const rows = Array.from({ length: parsed.data.count }, (_, i) => ({
    food_court_id: courtId,
    mode: "shared_table" as const,
    label: `${prefix}${start + i}`,
    capacity: parsed.data.capacity,
  }));
  const { error } = await admin.from("food_court_tables").insert(rows);
  if (error) return { error: error.message };
  revalidatePath(`/superadmin/food-courts/${courtId}`);
  return { ok: true };
}

export async function deleteCourtTable(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const courtId = String(formData.get("court_id"));
  const id = String(formData.get("table_id"));
  await createAdminClient().from("food_court_tables").delete().eq("id", id);
  revalidatePath(`/superadmin/food-courts/${courtId}`);
}

// Reset a stuck shared seat: wipe its session so the next party starts fresh
// (the "Free table" equivalent for food-court seats). Drops any join requests.
export async function freeCourtSeatAction(formData: FormData): Promise<void> {
  await requireSuperAdmin();
  const courtId = String(formData.get("court_id"));
  const seatId = String(formData.get("seat_id"));
  const admin = createAdminClient();
  await admin
    .from("food_court_tables")
    .update({ session_token: null, session_started_at: null })
    .eq("id", seatId);
  await admin.from("join_requests").delete().eq("food_court_table_id", seatId);
  revalidatePath(`/superadmin/food-courts/${courtId}`);
}
