import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { KDSBoard, type KdsOrder } from "./KDSBoard";

export const metadata: Metadata = { title: "Kitchen Display" };

const ORDER_SELECT =
  "id, status, table_note, placed_at, tables(table_number), order_items(id, name_snapshot, quantity, addons, variant, item_note, status)";

export default async function KitchenPage({
  params,
}: {
  params: Promise<{ restaurant_slug: string }>;
}) {
  const { restaurant_slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("restaurant_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.restaurant_id) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-6 text-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            No kitchen access
          </h1>
          <p className="mt-1 text-sm text-muted">
            This account isn&apos;t assigned to a restaurant. Ask your admin.
          </p>
        </div>
      </main>
    );
  }

  const [{ data: restaurant }, { data: orders }] = await Promise.all([
    supabase.from("restaurants").select("name, slug").eq("id", profile.restaurant_id).maybeSingle(),
    supabase
      .from("orders")
      .select(ORDER_SELECT)
      .in("status", ["placed", "accepted", "cooking", "ready", "served"])
      .order("placed_at", { ascending: true }),
  ]);

  // Staff always see their own café's board — fix the URL if it's wrong.
  if (restaurant && restaurant.slug !== restaurant_slug) {
    redirect(`/kitchen/${restaurant.slug}`);
  }

  return (
    <KDSBoard
      restaurantId={profile.restaurant_id}
      restaurantName={restaurant?.name ?? "Kitchen"}
      initialOrders={(orders ?? []) as unknown as KdsOrder[]}
    />
  );
}
