import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Store,
  Download,
  ExternalLink,
  Trash2,
  QrCode,
  Armchair,
} from "lucide-react";
import { getFoodCourt } from "@/lib/superadmin/fcData";
import {
  attachStoreToCourt,
  detachStoreFromCourt,
  toggleFoodCourtActive,
  deleteCourtTable,
  freeCourtSeatAction,
} from "@/lib/superadmin/fcActions";
import { Card } from "@/components/ui/Card";
import { Button, buttonVariants } from "@/components/ui/Button";
import { Select } from "@/components/ui/Input";
import { CopyButton } from "../../restaurants/[id]/CopyButton";
import { AddCourtTablesForm } from "./AddCourtTablesForm";

export const metadata: Metadata = { title: "Super Admin · Food court" };

export default async function FoodCourtDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getFoodCourt(id);
  if (!data) notFound();
  const { court, stores, accessPoints, attachable } = data;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const courtUrl = `${appUrl}/court/${court.qr_token}`;
  const seats = accessPoints.filter((a) => a.mode === "shared_table");

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/superadmin/food-courts"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Food courts
      </Link>

      {/* header + active toggle */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">{court.name}</h1>
          <p className="mt-0.5 text-sm text-muted">
            {stores.length} store{stores.length === 1 ? "" : "s"}
            {court.address ? ` · ${court.address}` : ""}
            {!court.is_active && " · suspended"}
          </p>
        </div>
        <form action={toggleFoodCourtActive}>
          <input type="hidden" name="court_id" value={court.id} />
          <input type="hidden" name="next" value={(!court.is_active).toString()} />
          <Button type="submit" variant={court.is_active ? "outline" : "primary"} size="sm">
            {court.is_active ? "Suspend court" : "Reactivate court"}
          </Button>
        </form>
      </div>

      {/* Court QR (pickup entry) */}
      <Card>
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold tracking-tight text-ink">
          <QrCode className="size-4 text-brand-500" /> Court QR (pickup entry)
        </h2>
        <p className="mb-3 text-sm text-muted">
          Print this anywhere in the court. Scanning it shows the store list; customers
          order &amp; pick up at the counter. (Per-table QRs are below.)
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/superadmin/fc-qr/${court.qr_token}`}
            className={buttonVariants({ size: "sm" })}
          >
            <Download className="size-4" /> Download QR
          </a>
          <Link
            href={`/court/${court.qr_token}`}
            target="_blank"
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <ExternalLink className="size-4" /> Preview
          </Link>
          <span className="inline-flex items-center gap-1 rounded-control bg-canvas px-2 py-1 text-xs text-muted">
            <span className="max-w-[12rem] truncate">{courtUrl}</span>
            <CopyButton value={courtUrl} />
          </span>
        </div>
      </Card>

      {/* Stores in this court */}
      <Card>
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold tracking-tight text-ink">
          <Store className="size-4 text-brand-500" /> Stores
        </h2>
        {stores.length === 0 ? (
          <p className="text-sm text-muted">No stores yet. Attach one below.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {stores.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-3 rounded-control border border-hairline/70 bg-surface p-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                  <p className="text-xs text-muted">
                    {s.is_accepting_orders ? "Open" : "Closed"} · /{s.slug}
                  </p>
                </div>
                <Link
                  href={`/superadmin/restaurants/${s.id}`}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  Manage
                </Link>
                <form action={detachStoreFromCourt}>
                  <input type="hidden" name="court_id" value={court.id} />
                  <input type="hidden" name="restaurant_id" value={s.id} />
                  <button
                    type="submit"
                    className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft hover:text-danger active:scale-95"
                    title="Remove from court"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}

        {/* attach an existing café as a store */}
        {attachable.length > 0 ? (
          <form action={attachStoreToCourt} className="mt-4 flex items-end gap-2">
            <input type="hidden" name="court_id" value={court.id} />
            <div className="flex-1">
              <label className="mb-1 block text-xs font-semibold text-ink-soft">
                Attach an existing café as a store
              </label>
              <Select name="restaurant_id" defaultValue="">
                <option value="" disabled>
                  Choose a café…
                </option>
                {attachable.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </div>
            <Button type="submit" variant="outline">
              Attach
            </Button>
          </form>
        ) : (
          <p className="mt-4 text-xs text-muted">
            No unattached cafés left to add.{" "}
            <Link href="/superadmin/restaurants/new" className="font-medium text-brand-600 hover:underline">
              Create a new café
            </Link>{" "}
            first, then attach it here.
          </p>
        )}
      </Card>

      {/* Shared tables (Phase 2 dine-in fulfillment) */}
      <Card>
        <h2 className="mb-1 flex items-center gap-1.5 text-sm font-bold tracking-tight text-ink">
          <Armchair className="size-4 text-brand-500" /> Shared tables (dine-in)
        </h2>
        <p className="mb-3 text-sm text-muted">
          Optional. Each seat gets its own QR — scanning it lets a party order from any
          store to that table. Skip this if the court is pickup-only.
        </p>
        {seats.length > 0 && (
          <div className="mb-4 grid gap-2 sm:grid-cols-2">
            {seats.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-control border border-hairline/70 bg-surface p-2.5"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
                  {t.label} · {t.capacity} seats
                </span>
                <a
                  href={`/api/superadmin/fc-qr/${t.qr_token}`}
                  className="grid size-8 place-items-center rounded-control text-muted hover:bg-canvas hover:text-ink active:scale-95"
                  title="Download QR"
                >
                  <Download className="size-4" />
                </a>
                <form action={freeCourtSeatAction}>
                  <input type="hidden" name="court_id" value={court.id} />
                  <input type="hidden" name="seat_id" value={t.id} />
                  <button
                    type="submit"
                    className="rounded-control border border-hairline px-2 py-1 text-xs font-semibold text-ink-soft transition-colors hover:bg-canvas active:scale-95"
                    title="Wipe the seat's session so the next party starts fresh"
                  >
                    Reset
                  </button>
                </form>
                <form action={deleteCourtTable}>
                  <input type="hidden" name="court_id" value={court.id} />
                  <input type="hidden" name="table_id" value={t.id} />
                  <button
                    type="submit"
                    className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft hover:text-danger active:scale-95"
                    title="Delete"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
        <AddCourtTablesForm courtId={court.id} />
      </Card>
    </div>
  );
}
