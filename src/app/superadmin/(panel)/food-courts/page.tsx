import type { Metadata } from "next";
import Link from "next/link";
import { Plus, UtensilsCrossed, ChevronRight, Store } from "lucide-react";
import { listFoodCourts } from "@/lib/superadmin/fcData";
import { buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";

export const metadata: Metadata = { title: "Super Admin · Food courts" };

export default async function FoodCourtsPage() {
  const courts = await listFoodCourts();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Food courts</h1>
          <p className="mt-0.5 text-sm text-muted">
            {courts.length} court{courts.length === 1 ? "" : "s"} · one QR, many stores.
          </p>
        </div>
        <Link href="/superadmin/food-courts/new" className={buttonVariants({ size: "md" })}>
          <Plus className="size-4" />
          New food court
        </Link>
      </div>

      {courts.length === 0 ? (
        <Card>
          <EmptyState
            icon={UtensilsCrossed}
            title="No food courts yet"
            description="Create a food court, then attach stores to it. Customers scan one code and order from any store."
            action={
              <Link href="/superadmin/food-courts/new" className={buttonVariants({ size: "md" })}>
                <Plus className="size-4" />
                Create a food court
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {courts.map((c) => (
            <Link
              key={c.id}
              href={`/superadmin/food-courts/${c.id}`}
              className="flex items-center gap-3 rounded-card border border-hairline/70 bg-surface p-4 shadow-card transition active:scale-[0.99]"
            >
              <div className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-500">
                <UtensilsCrossed className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-ink">{c.name}</p>
                <p className="flex items-center gap-1 text-xs text-muted">
                  <Store className="size-3" /> {c.storeCount} store{c.storeCount === 1 ? "" : "s"}
                  {!c.is_active && " · suspended"}
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
