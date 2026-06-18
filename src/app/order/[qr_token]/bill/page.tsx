import Link from "next/link";
import { cookies } from "next/headers";
import { QrCode, UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";
import type { ResolveResult } from "@/lib/customer/types";
import { cookieKey } from "@/lib/customer/session";
import { BillScreen } from "./BillScreen";

export default async function BillPage({
  params,
}: {
  params: Promise<{ qr_token: string }>;
}) {
  const { qr_token } = await params;
  const session = (await cookies()).get(cookieKey(qr_token))?.value ?? null;

  const noOrder = (
    <div className="flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={UtensilsCrossed}
        title="No active order"
        description="There's nothing to bill yet."
        action={
          <Link href={`/order/${qr_token}`} className={buttonVariants({ size: "md" })}>
            Browse the menu
          </Link>
        }
      />
    </div>
  );
  // Resolve only with a session cookie — never claim a session server-side.
  if (!session) return noOrder;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("resolve_table", {
    p_qr_token: qr_token,
    p_session_token: session,
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
  if (d.locked || !d.active_order) return noOrder;

  return (
    <BillScreen token={qr_token} restaurant={d.restaurant} order={d.active_order} />
  );
}
