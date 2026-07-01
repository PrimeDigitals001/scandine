import Link from "next/link";
import { cookies } from "next/headers";
import { QrCode, ShoppingBag } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonVariants } from "@/components/ui/Button";
import type { ResolveResult } from "@/lib/customer/types";
import { cookieKey } from "@/lib/customer/session";
import { CartScreen } from "./CartScreen";

export default async function CartPage({
  params,
}: {
  params: Promise<{ qr_token: string }>;
}) {
  const { qr_token } = await params;
  const session = (await cookies()).get(cookieKey(qr_token))?.value ?? null;

  // Resolve ONLY with a session (the menu establishes it). Resolving without one
  // would claim a fresh session server-side and lock the table.
  const goToMenu = (
    <div className="flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={ShoppingBag}
        title="Start from the menu"
        description="Open your table's menu to begin an order."
        action={
          <Link href={`/order/${qr_token}`} className={buttonVariants({ size: "md" })}>
            Browse the menu
          </Link>
        }
      />
    </div>
  );
  if (!session) return goToMenu;

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
  if (d.locked || d.ended) return goToMenu;

  return (
    <CartScreen
      token={qr_token}
      restaurant={d.restaurant}
      activeOrder={d.active_order}
    />
  );
}
