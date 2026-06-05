import { redirect } from "next/navigation";
import { ShieldCheck, LogOut } from "lucide-react";
import { getSuperAdminSession } from "@/lib/superadmin/auth";
import { logoutAction } from "@/lib/superadmin/actions";
import { PanelNav } from "./PanelNav";

export default async function PanelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Defense in depth: the proxy already guards /superadmin, but re-check here
  // so a privileged render can never happen without a valid session.
  const session = await getSuperAdminSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-20 border-b border-hairline bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-control bg-ink text-white">
              <ShieldCheck className="size-4" />
            </span>
            <span className="text-sm font-bold tracking-tight text-ink sm:text-base">
              Scan<span className="text-brand-500">Dine</span>
            </span>
          </div>

          <PanelNav />

          <form action={logoutAction}>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-canvas hover:text-danger"
            >
              <LogOut className="size-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
