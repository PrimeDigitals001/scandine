import type { Metadata } from "next";
import { ReceiptText } from "lucide-react";
import { getAdminContext } from "@/lib/admin/context";
import { getBillingOrders } from "@/lib/admin/data";
import { EmptyState } from "@/components/ui/EmptyState";
import { BillingCard } from "./BillingCard";

export const metadata: Metadata = { title: "Admin · Billing" };

export default async function BillingPage() {
  const ctx = await getAdminContext();
  const orders = await getBillingOrders();
  const tax = ctx?.restaurant.tax_config ?? { sgst: 2.5, cgst: 2.5 };
  const cafe = {
    name: ctx?.restaurant.name ?? "Restaurant",
    address: ctx?.restaurant.address ?? null,
    gstNumber: ctx?.restaurant.gst_number ?? null,
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Billing</h1>
        <p className="mt-0.5 text-sm text-muted">
          Generate the bill, take payment, then clear the table.
        </p>
      </div>

      {orders.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title="No open tables"
          description="When a table has an active order, it shows up here to bill."
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {orders.map((o) => (
            <BillingCard key={o.id} order={o} tax={tax} cafe={cafe} />
          ))}
        </div>
      )}
    </div>
  );
}
