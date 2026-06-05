import { QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ResolveResult } from "@/lib/customer/types";
import { CartScreen } from "./CartScreen";

export default async function CartPage({
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
  return (
    <CartScreen
      token={qr_token}
      restaurant={d.restaurant}
      activeOrder={d.active_order}
    />
  );
}
