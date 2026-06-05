import type { Metadata } from "next";
import { CartHydrator } from "./CartHydrator";
import { OrderTabBar } from "./OrderTabBar";

export const metadata: Metadata = {
  title: "Order",
  robots: { index: false, follow: false }, // customer table sessions are private
};

export default async function OrderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ qr_token: string }>;
}) {
  const { qr_token } = await params;
  // Full-bleed shell; each screen sets its own responsive max-width so the
  // menu can go wide (multi-column) on desktop while the cart/bill stay narrow.
  return (
    <div className="min-h-dvh w-full bg-canvas">
      <CartHydrator />
      {children}
      <OrderTabBar token={qr_token} />
    </div>
  );
}
