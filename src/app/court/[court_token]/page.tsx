import { Suspense } from "react";
import Link from "next/link";
import { Store, ChevronRight, QrCode, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import type { FcResolve } from "@/lib/customer/fcTypes";
import { EmptyState } from "@/components/ui/EmptyState";
import { SeatJoin } from "./SeatJoin";
import { YourOrdersLink } from "./YourOrdersLink";

const GRADIENTS = [
  "from-brand-100 to-brand-200",
  "from-amber-100 to-orange-100",
  "from-rose-100 to-orange-100",
  "from-emerald-100 to-teal-100",
  "from-yellow-100 to-amber-100",
];
const gradientFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % GRADIENTS.length;
  return GRADIENTS[h];
};

export default async function CourtPage({
  params,
}: {
  params: Promise<{ court_token: string }>;
}) {
  const { court_token } = await params;
  // resolve_food_court does NOT claim a session, so it's safe server-side.
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_food_court", {
    p_token: court_token,
  });

  if (error || !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <EmptyState
          icon={QrCode}
          title="This code isn't active"
          description="This food-court QR code isn't recognised. Please ask staff for help."
        />
      </div>
    );
  }

  const fc = data as FcResolve;
  const isPickup = fc.access.mode === "pickup";

  return (
    <div className="w-full pb-12">
      <Suspense fallback={null}>
        <SeatJoin token={court_token} />
      </Suspense>
      <header className="bg-brand-500 px-4 pb-6 pt-7 text-white md:px-6">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-medium text-white/80">
            {isPickup ? "Order & pick up" : `Dine-in · ${fc.access.label}`}
          </p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight md:text-3xl">
            {fc.food_court.name}
          </h1>
          <p className="mt-1 max-w-prose text-sm text-white/85">
            Choose a store to see its menu and order. You can order from more
            than one — each comes separately.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-5 md:px-6">
        <YourOrdersLink token={court_token} />
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          {fc.stores.length} {fc.stores.length === 1 ? "store" : "stores"}
        </h2>

        {fc.stores.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No stores yet"
            description="This food court hasn't added any stores. Please check back soon."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {fc.stores.map((s) => {
              const open = s.is_accepting_orders;
              const inner = (
                <>
                  <div
                    className={`grid size-12 shrink-0 place-items-center rounded-card bg-gradient-to-br text-lg font-bold text-brand-400 ${gradientFor(s.id)}`}
                    aria-hidden="true"
                  >
                    {s.name.charAt(0)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                    {open ? (
                      <p className="text-xs text-success-strong">Open · taking orders</p>
                    ) : (
                      <p className="flex items-center gap-1 text-xs text-muted">
                        <Clock className="size-3" /> Closed right now
                      </p>
                    )}
                  </div>
                  {open && <ChevronRight className="size-5 shrink-0 text-muted" />}
                </>
              );
              return open ? (
                <Link
                  key={s.id}
                  href={`/court/${court_token}/${s.slug}`}
                  className="flex items-center gap-3 rounded-card border border-hairline/70 bg-surface p-3 shadow-card transition active:scale-[0.99]"
                >
                  {inner}
                </Link>
              ) : (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-card border border-hairline/70 bg-surface p-3 opacity-60"
                >
                  {inner}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
