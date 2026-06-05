import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ScanDine",
    template: "%s · ScanDine",
  },
  description:
    "Scan. Order. Dine. Zero-hardware QR dine-in ordering, kitchen display, and billing for cafes & restaurants.",
  applicationName: "ScanDine",
};

export const viewport: Viewport = {
  // Brand the mobile status bar / address bar; cover the notch for the PWA.
  themeColor: "#E85D26",
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Note: intentionally NOT disabling user zoom — accessibility.
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
