import type { Metadata } from "next";
import Link from "next/link";
import { Armchair, ListOrdered, Receipt, IndianRupee, PauseCircle } from "lucide-react";
import { getAdminContext } from "@/lib/admin/context";
import { getDashboard } from "@/lib/admin/data";
import { freeTableAction } from "@/lib/admin/actions";
import { Card } from "@/components/ui/Card";
import { StatusChip } from "@/components/ui/StatusChip";
import { formatINR } from "@/lib/format";
import { cn } from "@/lib/cn";
import { OpenToggle } from "../OpenToggle";

export const metadata: Metadata = { title: "Admin · Floor" };

const tableTone = {
  empty: "border-hairline bg-surface",
  occupied: "border-warning/40 bg-warning-soft/40",
  billing: "border-info/40 bg-info-soft/50",
} as const;

export default async function AdminDashboardPage() {
  const [{ tables, stats }, ctx] = await Promise.all([
    getDashboard(),
    getAdminContext(),
  ]);
  const accepting = ctx?.restaurant.is_accepting_orders ?? true;

  const STATS = [
    { label: "Tables in use", value: String(stats.occupied), icon: Armchair },
    { label: "Active orders", value: String(stats.activeOrders), icon: ListOrdered },
    { label: "Orders today", value: String(stats.ordersToday), icon: Receipt },
    {
      label: "Revenue today",
      value: formatINR(stats.revenueToday, { decimals: false }),
      icon: IndianRupee,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Floor</h1>
          <p className="mt-0.5 text-sm text-muted">
            Live table status. Tap an occupied table to bill it.
          </p>
        </div>
        <OpenToggle accepting={accepting} />
      </div>

      {!accepting && (
        <div className="flex items-start gap-3 rounded-card border border-danger/25 bg-danger-soft px-4 py-3">
          <PauseCircle className="size-5 shrink-0 text-danger-strong" />
          <p className="text-sm text-danger-strong">
            <span className="font-bold">You&apos;re not taking orders.</span>{" "}
            Anyone who scans a table QR sees a “closed” notice and can&apos;t
            order until you switch back to Open.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {STATS.map((s) => (
          <Card key={s.label} className="flex flex-col gap-2">
            <span className="grid size-9 place-items-center rounded-control bg-brand-50 text-brand-600">
              <s.icon className="size-5" />
            </span>
            <div>
              <p className="text-2xl font-bold tabular-nums tracking-tight text-ink">
                {s.value}
              </p>
              <p className="text-xs text-muted">{s.label}</p>
            </div>
          </Card>
        ))}
      </div>

      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          Tables ({tables.length})
        </h2>
        {tables.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              No tables yet — they&apos;re added during onboarding.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {tables.map((t) => {
              const content = (
                <div
                  className={cn(
                    "flex h-full flex-col gap-2 rounded-card border p-4 transition-shadow",
                    tableTone[t.status],
                    t.order && "hover:shadow-pop",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold tracking-tight text-ink">
                      {t.table_number}
                    </span>
                    <span className="text-xs text-muted">{t.capacity} seats</span>
                  </div>
                  {t.order ? (
                    <StatusChip status={t.order.status} live />
                  ) : t.locked ? (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium text-info">
                        In use · no order yet
                      </span>
                      <form action={freeTableAction}>
                        <input type="hidden" name="table_id" value={t.id} />
                        <button
                          type="submit"
                          className="rounded-control border border-hairline bg-surface px-2 py-1 text-xs font-semibold text-ink-soft transition-colors hover:bg-canvas active:scale-95"
                        >
                          Free table
                        </button>
                      </form>
                    </div>
                  ) : (
                    <span className="text-sm font-medium capitalize text-muted">
                      {t.status}
                    </span>
                  )}
                </div>
              );
              return t.order ? (
                <Link key={t.id} href="/admin/billing">
                  {content}
                </Link>
              ) : (
                <div key={t.id}>{content}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
