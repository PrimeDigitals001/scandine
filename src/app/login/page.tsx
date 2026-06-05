import type { Metadata } from "next";
import { QrCode } from "lucide-react";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-canvas px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 grid size-12 place-items-center rounded-card bg-brand-500 text-white shadow-card">
            <QrCode className="size-6" />
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-ink">
            Sign in to Scan<span className="text-brand-500">Dine</span>
          </h1>
          <p className="mt-1 text-sm text-muted">
            Owners, kitchen staff, and operators — one sign-in.
          </p>
        </div>

        <div className="rounded-card border border-hairline/70 bg-surface p-6 shadow-card">
          <LoginForm />
        </div>

        <p className="mt-5 text-center text-xs text-faint">
          Customers don&apos;t sign in — they just scan the table QR.
        </p>
      </div>
    </main>
  );
}
