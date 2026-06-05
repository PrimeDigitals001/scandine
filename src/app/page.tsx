import Link from "next/link";
import {
  QrCode,
  ChefHat,
  LayoutDashboard,
  ShieldCheck,
  ArrowRight,
  Smartphone,
  Zap,
  IndianRupee,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { StatusChip } from "@/components/ui/StatusChip";
import { HeroDemo } from "@/components/landing/HeroDemo";
import { ORDER_STATUSES } from "@/lib/orderStatus";

const PORTALS = [
  {
    href: "/order/demo",
    icon: QrCode,
    title: "Customer",
    desc: "Scan → menu → order → live status. No app, no login.",
    step: 4,
  },
  {
    href: "/kitchen/demo",
    icon: ChefHat,
    title: "Kitchen Display",
    desc: "Live order queue with audio alerts. Tablet-first.",
    step: 5,
  },
  {
    href: "/admin",
    icon: LayoutDashboard,
    title: "Admin",
    desc: "Menu builder, floor view, tables, QRs, billing.",
    step: 6,
  },
  {
    href: "/superadmin",
    icon: ShieldCheck,
    title: "Super Admin",
    desc: "Onboard cafés, create tenants, generate QRs.",
    step: 3,
  },
] as const;

const PROOFS = [
  { icon: Smartphone, label: "Works on any phone" },
  { icon: Zap, label: "Zero hardware" },
  { icon: IndianRupee, label: "Free to start" },
] as const;

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      {/* Header */}
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-control bg-brand-500 text-white shadow-card">
            <QrCode className="size-5" aria-hidden="true" />
          </span>
          <span className="text-lg font-bold tracking-tight text-ink">
            Scan<span className="text-brand-500">Dine</span>
          </span>
        </div>
        <Badge tone="brand">Tier-1 · MVP</Badge>
      </header>

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-10 px-5 py-8 sm:px-8 lg:grid-cols-2 lg:gap-12 lg:py-14">
        <div className="flex flex-col items-start">
          <span className="inline-flex items-center gap-2 rounded-pill border border-hairline bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft shadow-card">
            <span className="size-2 rounded-full bg-success" />
            Dine-in, done digitally
          </span>

          <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.05] tracking-tight text-ink sm:text-5xl lg:text-[3.5rem]">
            Scan. Order.{" "}
            <span className="text-brand-500">Dine.</span>
          </h1>

          <p className="mt-4 max-w-md text-pretty text-base leading-relaxed text-muted sm:text-lg">
            A QR sticker on the table is the whole setup. Customers order from
            their phone, the kitchen sees it live, the bill closes itself —
            built for Tier-2/3 cafés still on paper KOTs.
          </p>

          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Link href="#portals" className={buttonVariants({ size: "lg" })}>
              Explore the build
              <ArrowRight className="size-4" />
            </Link>
            <Link
              href="/order/demo"
              className={buttonVariants({ size: "lg", variant: "outline" })}
            >
              Open customer demo
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            {PROOFS.map((p) => (
              <li
                key={p.label}
                className="flex items-center gap-2 text-sm font-medium text-ink-soft"
              >
                <p.icon className="size-4 text-brand-500" aria-hidden="true" />
                {p.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="flex justify-center lg:justify-end">
          <HeroDemo />
        </div>
      </section>

      {/* Order lifecycle — proves the status colour map */}
      <section className="mx-auto w-full max-w-6xl px-5 pb-4 sm:px-8">
        <Card className="overflow-hidden">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            One order, start to finish — every stage pushed live
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {ORDER_STATUSES.map((status, i) => (
              <StatusChip key={status} status={status} live={i === 2} />
            ))}
          </div>
        </Card>
      </section>

      {/* Portals */}
      <section
        id="portals"
        className="mx-auto w-full max-w-6xl scroll-mt-6 px-5 py-10 sm:px-8 lg:py-14"
      >
        <div className="mb-5 flex items-end justify-between">
          <h2 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">
            Four surfaces, one app
          </h2>
          <span className="text-sm text-muted">Tap to enter</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PORTALS.map((p) => (
            <Link key={p.href} href={p.href} className="group">
              <Card interactive className="flex h-full flex-col">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-control bg-brand-50 text-brand-600">
                    <p.icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="text-xs font-medium text-faint">
                    Step {p.step}
                  </span>
                </div>
                <h3 className="mt-4 flex items-center gap-1 text-base font-semibold tracking-tight text-ink">
                  {p.title}
                  <ArrowRight className="size-4 -translate-x-1 text-muted opacity-0 transition-all duration-200 group-hover:translate-x-0 group-hover:opacity-100" />
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {p.desc}
                </p>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mx-auto w-full max-w-6xl border-t border-hairline px-5 py-6 sm:px-8">
        <p className="text-center text-xs text-muted">
          ScanDine — zero-hardware QR dine-in ordering · brand{" "}
          <span className="font-semibold text-brand-500">#E85D26</span>
        </p>
      </footer>
    </main>
  );
}
