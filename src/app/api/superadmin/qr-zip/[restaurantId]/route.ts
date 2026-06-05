import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";
import JSZip from "jszip";
import { createAdminClient } from "@/lib/supabase/admin";

// Guarded by the proxy. Bundles every table's QR PNG into one printable ZIP.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ restaurantId: string }> },
) {
  const { restaurantId } = await params;
  const admin = createAdminClient();

  const [{ data: restaurant }, { data: tables }] = await Promise.all([
    admin.from("restaurants").select("slug").eq("id", restaurantId).maybeSingle(),
    admin
      .from("tables")
      .select("table_number, qr_token")
      .eq("restaurant_id", restaurantId)
      .order("table_number"),
  ]);

  if (!tables || tables.length === 0) {
    return new NextResponse("No tables to export", { status: 404 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const zip = new JSZip();

  for (const t of tables) {
    const png = await QRCode.toBuffer(`${appUrl}/order/${t.qr_token}`, {
      type: "png",
      width: 720,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#1C1917", light: "#FFFFFFFF" },
    });
    zip.file(`${t.table_number}.png`, png);
  }

  const buf = await zip.generateAsync({ type: "nodebuffer" });
  const slug = restaurant?.slug ?? "cafe";

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="scandine-qr-${slug}.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
