import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Store, CheckCircle2, Grid3x3, Receipt } from "lucide-react";
import { getDashboardData } from "@/lib/superadmin/data";
import { buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { RestaurantsTable } from "../restaurants/RestaurantsTable";

export const metadata: Metadata = { title: "Super Admin · Dashboard" };

const STAT_META = [
  { key: "restaurants", label: "Cafés", icon: Store },
  { key: "active", label: "Active", icon: CheckCircle2 },
  { key: "tables", label: "Tables", icon: Grid3x3 },
  { key: "ordersToday", label: "Orders today", icon: Receipt },
] as const;

export default async function DashboardPage() {
  const { restaurants, stats } = await getDashboardData();
  const recent = restaurants.slice(0, 6);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Dashboard</h1>
          <p className="mt-0.5 text-sm text-muted">
            Every café running on ScanDine, at a glance.
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

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STAT_META.map((s) => (
          <Card key={s.key} className="flex flex-col gap-2">
            <span className="grid size-9 place-items-center rounded-control bg-brand-50 text-brand-600">
              <s.icon className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-ink">
                {stats[s.key]}
              </p>
              <p className="text-xs text-muted">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <Card flush className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-semibold tracking-tight text-ink">
            Recent cafés
          </h2>
          <Link
            href="/superadmin/restaurants"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            View all
          </Link>
        </div>
        {recent.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No cafés yet"
            description="Onboard your first café to generate its QR codes and go live."
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
            <RestaurantsTable restaurants={recent} />
          </div>
        )}
      </Card>
    </div>
  );
}
