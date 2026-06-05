import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Store } from "lucide-react";
import { listRestaurants } from "@/lib/superadmin/data";
import { buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RestaurantsTable } from "./RestaurantsTable";

export const metadata: Metadata = { title: "Super Admin · Cafés" };

export default async function RestaurantsPage() {
  const restaurants = await listRestaurants();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Cafés</h1>
          <p className="mt-0.5 text-sm text-muted">
            {restaurants.length} tenant{restaurants.length === 1 ? "" : "s"} on ScanDine.
          </p>
        </div>
        <Link
          href="/superadmin/restaurants/new"
          className={buttonVariants({ size: "md" })}
        >
          <Plus className="size-4" />
          New café
        </Link>
      </div>

      <Card flush className="overflow-hidden">
        {restaurants.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No cafés yet"
            description="Create your first tenant to start onboarding."
            action={
              <Link
                href="/superadmin/restaurants/new"
                className={buttonVariants({ size: "md" })}
              >
                <Plus className="size-4" />
                Create a café
              </Link>
            }
          />
        ) : (
          <div className="px-2 py-1">
            <RestaurantsTable restaurants={restaurants} />
          </div>
        )}
      </Card>
    </div>
  );
}
