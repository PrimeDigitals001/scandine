import { NextResponse } from "next/server";
import QRCode from "qrcode";
import JSZip from "jszip";
import { createClient } from "@/lib/supabase/server";

// All of the owner's table QRs in one printable ZIP. RLS scopes `tables` to
// the caller's restaurant, so this only ever bundles their own tables.
export async function GET() {
  const supabase = await createClient();
  const { data: tables } = await supabase
    .from("tables")
    .select("table_number, qr_token")
    .order("table_number");

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
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="scandine-qr-codes.zip"`,
      "Cache-Control": "no-store",
    },
  });
}
