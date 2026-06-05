import Link from "next/link";
import { QrCode, UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";
import type { ResolveResult } from "@/lib/customer/types";
import { StatusScreen } from "./StatusScreen";

export default async function StatusPage({
  params,
}: {
  params: Promise<{ qr_token: string }>;
}) {
  const { qr_token } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_table", {
    p_qr_token: qr_token,
  });

  if (error || !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <EmptyState
          icon={QrCode}
          title="This QR code isn't active"
          description="Please ask the staff for a fresh code for your table."
        />
      </div>
    );
  }

  const d = data as ResolveResult;
  if (!d.active_order) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <EmptyState
          icon={UtensilsCrossed}
          title="No active order"
          description="Browse the menu and place an order to track it live here."
          action={
            <Link
              href={`/order/${qr_token}`}
              className={buttonVariants({ size: "md" })}
            >
              Browse the menu
            </Link>
          }
        />
      </div>
    );
  }

  return (
    <StatusScreen
      token={qr_token}
      restaurant={d.restaurant}
      tableNumber={d.table.table_number}
      initialOrder={d.active_order}
    />
  );
}
