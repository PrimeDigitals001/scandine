import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import { createClient } from "@/lib/supabase/server";

// Owner downloads a printable QR for one of THEIR tables. RLS on `tables`
// means the lookup only succeeds for a table in the caller's restaurant.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const supabase = await createClient();
  const { data: table } = await supabase
    .from("tables")
    .select("id")
    .eq("qr_token", token)
    .maybeSingle();
  if (!table) return new NextResponse("Not found", { status: 404 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const png = await QRCode.toBuffer(`${appUrl}/order/${token}`, {
    type: "png",
    width: 720,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#1C1917", light: "#FFFFFFFF" },
  });

  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="scandine-qr-${token}.png"`,
      "Cache-Control": "no-store",
    },
  });
}
