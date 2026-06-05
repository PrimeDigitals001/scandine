import { QrCode } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ResolveResult } from "@/lib/customer/types";
import { MenuScreen } from "./MenuScreen";

export default async function OrderPage({
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
          description="It may be old or the table was just cleared. Please ask the staff to bring a fresh code for your table."
        />
      </div>
    );
  }

  return <MenuScreen token={qr_token} data={data as ResolveResult} />;
}
