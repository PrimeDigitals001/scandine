import type { Metadata } from "next";
import { FcCartHydrator } from "./FcCartHydrator";

export const metadata: Metadata = {
  title: "Food court",
  robots: { index: false, follow: false }, // customer sessions are private
};

export default function CourtLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh w-full bg-canvas">
      <FcCartHydrator />
      {children}
    </div>
  );
}
