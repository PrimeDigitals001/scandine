import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Download,
  QrCode,
  Trash2,
  Users,
  Grid3x3,
} from "lucide-react";
import { getRestaurant } from "@/lib/superadmin/data";
import { toggleRestaurantActive, deleteTable } from "@/lib/superadmin/actions";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonVariants } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/cn";
import { AddTablesForm } from "./AddTablesForm";
import { CreateAdminForm } from "./CreateAdminForm";
import { CopyButton } from "./CopyButton";

export const metadata: Metadata = { title: "Super Admin · Café" };

const tableTone = {
  empty: "neutral",
  occupied: "warning",
  billing: "info",
} as const;

export default async function RestaurantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const data = await getRestaurant(id);
  if (!data) notFound();

  const { restaurant, tables, staff } = data;
  const admins = staff.filter((s) => s.role === "admin");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/superadmin/restaurants"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Cafés
      </Link>

      {/* Header */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight text-ink">
                {restaurant.name}
              </h1>
              {restaurant.is_active ? (
                <Badge tone="success" dot>
                  Active
                </Badge>
              ) : (
                <Badge tone="danger" dot>
                  Suspended
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">
              /{restaurant.slug} · {restaurant.subscription_plan} plan ·{" "}
              {restaurant.pos_mode === "standalone"
                ? "Standalone billing"
                : "POS-integrated"}
            </p>
          </div>

          <form action={toggleRestaurantActive}>
            <input type="hidden" name="restaurant_id" value={restaurant.id} />
            <input
              type="hidden"
              name="next"
              value={(!restaurant.is_active).toString()}
            />
            <Button
              type="submit"
              variant={restaurant.is_active ? "outline" : "dark"}
              size="sm"
            >
              {restaurant.is_active ? "Suspend" : "Reactivate"}
            </Button>
          </form>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 border-t border-hairline pt-4 text-sm sm:grid-cols-2">
          <Detail label="Address" value={restaurant.address} />
          <Detail label="GST number" value={restaurant.gst_number} />
          <Detail
            label="Google review URL"
            value={restaurant.google_review_url}
            mono
          />
          <Detail
            label="Tax"
            value={`SGST ${restaurant.tax_config.sgst}% + CGST ${restaurant.tax_config.cgst}%`}
          />
        </dl>
      </Card>

      {/* Tables + QR codes */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
            <Grid3x3 className="size-5 text-brand-500" />
            Tables &amp; QR codes
            <span className="text-sm font-normal text-muted">
              ({tables.length})
            </span>
          </h2>
          {tables.length > 0 && (
            <a
              href={`/api/superadmin/qr-zip/${restaurant.id}`}
              className={buttonVariants({ variant: "dark", size: "sm" })}
            >
              <Download className="size-4" />
              Download all QRs (.zip)
            </a>
          )}
        </div>

        <AddTablesForm restaurantId={restaurant.id} />

        {tables.length === 0 ? (
          <EmptyState
            icon={Grid3x3}
            title="No tables yet"
            description="Add tables above — each gets a unique QR code to print and place."
          />
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {tables.map((t) => (
              <li
                key={t.id}
                className="flex items-center gap-3 rounded-control border border-hairline bg-canvas/50 px-3 py-2.5"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-control bg-surface text-ink shadow-card">
                  <QrCode className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">
                      {t.table_number}
                    </span>
                    <Badge tone={tableTone[t.status]}>{t.status}</Badge>
                    <span className="text-xs text-muted">· {t.capacity} seats</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <span className="truncate font-mono text-xs text-faint">
                      /order/{t.qr_token}
                    </span>
                    <CopyButton value={`${appUrl}/order/${t.qr_token}`} />
                  </div>
                </div>
                <a
                  href={`/api/superadmin/qr/${t.qr_token}`}
                  className={cn(
                    buttonVariants({ variant: "outline", size: "sm" }),
                    "shrink-0",
                  )}
                  title="Download QR PNG"
                >
                  <Download className="size-4" />
                </a>
                <form action={deleteTable}>
                  <input type="hidden" name="table_id" value={t.id} />
                  <input
                    type="hidden"
                    name="restaurant_id"
                    value={restaurant.id}
                  />
                  <button
                    type="submit"
                    className="grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft hover:text-danger active:scale-95"
                    title="Delete table"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Owner logins */}
      <Card className="flex flex-col gap-4">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
          <Users className="size-5 text-brand-500" />
          Owner logins
          <span className="text-sm font-normal text-muted">
            ({admins.length})
          </span>
        </h2>

        {admins.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {admins.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-control border border-hairline bg-canvas/50 px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">
                    {a.email ?? "—"}
                  </p>
                  {a.full_name && (
                    <p className="truncate text-xs text-muted">{a.full_name}</p>
                  )}
                </div>
                <Badge tone={a.is_active ? "success" : "neutral"}>
                  {a.is_active ? "active" : "disabled"}
                </Badge>
              </li>
            ))}
          </ul>
        )}

        <div className="border-t border-hairline pt-4">
          <p className="mb-3 text-sm font-medium text-ink-soft">
            Create an owner login for <span className="font-mono">/admin</span>
          </p>
          <CreateAdminForm restaurantId={restaurant.id} />
        </div>
      </Card>
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-faint">{label}</dt>
      <dd
        className={cn(
          "truncate text-ink-soft",
          mono && "font-mono text-xs",
          !value && "text-faint",
        )}
      >
        {value || "—"}
      </dd>
    </div>
  );
}
