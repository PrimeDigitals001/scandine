"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "./types";

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
