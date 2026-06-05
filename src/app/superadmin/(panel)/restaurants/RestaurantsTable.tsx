import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import type { RestaurantWithStats } from "@/lib/superadmin/data";

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="w-20 text-right">
      <p className="text-sm font-semibold tabular-nums text-ink">{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-faint">{label}</p>
    </div>
  );
}

export function RestaurantsTable({
  restaurants,
}: {
  restaurants: RestaurantWithStats[];
}) {
  return (
    <ul className="divide-y divide-hairline">
      {restaurants.map((r) => (
        <li key={r.id}>
          <Link
            href={`/superadmin/restaurants/${r.id}`}
            className="group flex items-center gap-3 rounded-control px-2 py-3 transition-colors hover:bg-canvas"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-semibold text-ink">{r.name}</span>
                {r.is_active ? (
                  <Badge tone="success" dot>
                    Active
                  </Badge>
                ) : (
                  <Badge tone="danger" dot>
                    Suspended
                  </Badge>
                )}
              </div>
              <p className="truncate text-xs text-muted">
                /{r.slug} · {r.subscription_plan} plan
              </p>
            </div>
            <div className="hidden gap-4 sm:flex">
              <Stat label="Tables" value={r.tableCount} />
              <Stat label="Orders/mo" value={r.ordersThisMonth} />
            </div>
            <ChevronRight className="size-4 shrink-0 text-faint transition-colors group-hover:text-muted" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
