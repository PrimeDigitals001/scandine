import { NextResponse, type NextRequest } from "next/server";
import QRCode from "qrcode";

// Guarded by the proxy (/api/superadmin/* requires the super-admin session).
// Returns a printable PNG QR that encodes the customer URL for this table.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const target = `${appUrl}/order/${token}`;

  const png = await QRCode.toBuffer(target, {
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
