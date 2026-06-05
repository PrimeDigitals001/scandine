"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminContext } from "./context";
import type { ActionState } from "./types";

// Privileged credential work needs the service role, but only AFTER we confirm
// the caller is an admin of a specific restaurant (then we scope writes to it).
async function requireAdmin() {
  const ctx = await getAdminContext();
  if (!ctx || ctx.role !== "admin") throw new Error("Unauthorized");
  return ctx;
}

const tempPassword = () => `Cafe-${randomBytes(4).toString("hex")}`;

const opt = (v: FormDataEntryValue | null): string | null => {
  const s = String(v ?? "").trim();
  return s === "" ? null : s;
};

// ---- auth ------------------------------------------------------------------

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

// ---- billing (RLS + SECURITY DEFINER RPCs enforce admin + tenant) ----------

export async function generateBillAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const orderId = String(formData.get("order_id"));
  const discount = Number(formData.get("discount") ?? 0) || 0;
  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_bill", {
    p_order_id: orderId,
    p_discount: discount,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin/billing");
  revalidatePath("/admin/dashboard");
  return { ok: true };
}

export async function confirmPaymentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const billId = String(formData.get("bill_id"));
  const method = String(formData.get("payment_method")); // cash|upi|card
  if (!["cash", "upi", "card"].includes(method)) {
    return { error: "Pick a payment method." };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("bills")
    .update({ payment_method: method, paid_at: new Date().toISOString() })
    .eq("id", billId);
  if (error) return { error: error.message };
  revalidatePath("/admin/billing");
  return { ok: true };
}

export async function clearTableAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get("order_id"));
  const supabase = await createClient();
  await supabase.rpc("clear_table", { p_order_id: orderId });
  revalidatePath("/admin/billing");
  revalidatePath("/admin/dashboard");
}

// ---- order status (admin can nudge from the floor) -------------------------

export async function setOrderStatusAction(formData: FormData): Promise<void> {
  const orderId = String(formData.get("order_id"));
  const status = String(formData.get("status"));
  const supabase = await createClient();
  const patch: Record<string, unknown> = { status };
  if (status === "served") patch.served_at = new Date().toISOString();
  await supabase.from("orders").update(patch).eq("id", orderId);
  revalidatePath("/admin/dashboard");
}

// ---- menu ------------------------------------------------------------------

const itemSchema = z.object({
  name: z.string().trim().min(1, "Name is required."),
  price: z.coerce.number().min(0, "Price can't be negative."),
  category_id: z.string().uuid("Pick a category."),
});

export async function saveItemAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const id = opt(formData.get("id"));
  const parsed = itemSchema.safeParse({
    name: formData.get("name"),
    price: formData.get("price"),
    category_id: formData.get("category_id"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  // restaurant_id comes from the caller's profile (needed for INSERT under RLS)
  const restaurantId = String(formData.get("restaurant_id"));
  const row = {
    restaurant_id: restaurantId,
    category_id: parsed.data.category_id,
    name: parsed.data.name,
    description: opt(formData.get("description")),
    price: parsed.data.price,
    is_veg: formData.get("is_veg") === "on",
    is_available: formData.get("is_available") === "on",
  };

  const { error } = id
    ? await supabase.from("menu_items").update(row).eq("id", id)
    : await supabase.from("menu_items").insert(row);
  if (error) return { error: error.message };
  revalidatePath("/admin/menu");
  return { ok: true };
}

export async function setItemAvailabilityAction(
  formData: FormData,
): Promise<void> {
  const id = String(formData.get("id"));
  const available = formData.get("available") === "true";
  const supabase = await createClient();
  await supabase.from("menu_items").update({ is_available: available }).eq("id", id);
  revalidatePath("/admin/menu");
}

export async function deleteItemAction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("menu_items").delete().eq("id", id);
  revalidatePath("/admin/menu");
}

export async function createCategoryAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 1) return { error: "Category name is required." };
  const restaurantId = String(formData.get("restaurant_id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("menu_categories")
    .insert({ restaurant_id: restaurantId, name });
  if (error) return { error: error.message };
  revalidatePath("/admin/menu");
  return { ok: true };
}

// ---- settings --------------------------------------------------------------

export async function updateSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const googleUrl = opt(formData.get("google_review_url"));
  if (googleUrl && !/^https?:\/\//i.test(googleUrl)) {
    return { error: "Google review URL must start with http(s)://" };
  }
  const sgst = Number(formData.get("sgst") ?? 2.5);
  const cgst = Number(formData.get("cgst") ?? 2.5);
  if (![sgst, cgst].every((n) => Number.isFinite(n) && n >= 0 && n <= 50)) {
    return { error: "GST rates must be between 0 and 50." };
  }

  const id = String(formData.get("restaurant_id"));
  const supabase = await createClient();
  const { error } = await supabase
    .from("restaurants")
    .update({
      address: opt(formData.get("address")),
      gst_number: opt(formData.get("gst_number")),
      google_review_url: googleUrl,
      tax_config: { sgst, cgst },
    })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

// ---- staff (kitchen) credentials -------------------------------------------

const staffSchema = z.object({
  email: z.string().trim().email("Enter a valid email."),
  full_name: z.string().trim().max(120).optional(),
});

export async function createStaffAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAdmin();
  const parsed = staffSchema.safeParse({
    email: formData.get("email"),
    full_name: opt(formData.get("full_name")) ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const svc = createAdminClient();
  const pw = tempPassword();
  const { data: created, error: cErr } = await svc.auth.admin.createUser({
    email: parsed.data.email,
    password: pw,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name ?? null },
  });
  if (cErr || !created.user) {
    return { error: cErr?.message ?? "Could not create the login." };
  }
  const { error: pErr } = await svc.from("profiles").insert({
    id: created.user.id,
    restaurant_id: ctx.restaurantId,
    role: "staff",
    full_name: parsed.data.full_name ?? null,
  });
  if (pErr) {
    await svc.auth.admin.deleteUser(created.user.id);
    return { error: pErr.message };
  }
  revalidatePath("/admin/staff");
  return { ok: true, createdEmail: parsed.data.email, tempPassword: pw };
}

export async function resetStaffPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const ctx = await requireAdmin();
  const staffId = String(formData.get("staff_id"));
  const svc = createAdminClient();
  const { data: prof } = await svc
    .from("profiles")
    .select("restaurant_id")
    .eq("id", staffId)
    .maybeSingle();
  if (!prof || prof.restaurant_id !== ctx.restaurantId) {
    return { error: "That staff member isn't on your team." };
  }
  const pw = tempPassword();
  const { error } = await svc.auth.admin.updateUserById(staffId, { password: pw });
  if (error) return { error: error.message };
  revalidatePath("/admin/staff");
  return { ok: true, tempPassword: pw, resetStaffId: staffId };
}

export async function setStaffActiveAction(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const staffId = String(formData.get("staff_id"));
  const active = formData.get("active") === "true";
  const svc = createAdminClient();
  const { data: prof } = await svc
    .from("profiles")
    .select("restaurant_id")
    .eq("id", staffId)
    .maybeSingle();
  if (prof?.restaurant_id !== ctx.restaurantId) return;
  await svc.from("profiles").update({ is_active: active }).eq("id", staffId);
  revalidatePath("/admin/staff");
}

export async function deleteStaffAction(formData: FormData): Promise<void> {
  const ctx = await requireAdmin();
  const staffId = String(formData.get("staff_id"));
  const svc = createAdminClient();
  const { data: prof } = await svc
    .from("profiles")
    .select("restaurant_id")
    .eq("id", staffId)
    .maybeSingle();
  if (prof?.restaurant_id !== ctx.restaurantId) return;
  await svc.auth.admin.deleteUser(staffId); // profile row cascades on delete
  revalidatePath("/admin/staff");
}

// ---- change own password ---------------------------------------------------

export async function changeOwnPasswordAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireAdmin();
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }
  const supabase = await createClient(); // acts as the logged-in admin
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };
  return { ok: true };
}
