import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/admin/context";
import { signOutAction } from "@/lib/admin/actions";
import { Button } from "@/components/ui/Button";
import { AdminTopBar } from "./AdminTopBar";
import { AdminLive } from "./AdminLive";

export default async function AdminAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");

  // Staff accounts belong on the KDS, not the owner dashboard.
  if (ctx.role !== "admin") {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            This area is for restaurant owners
          </h1>
          <p className="mt-1 text-sm text-muted">
            Your account is a kitchen staff login. Use the Kitchen Display
            instead.
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <AdminTopBar restaurantName={ctx.restaurant.name} signOut={signOutAction} />
      <AdminLive restaurantId={ctx.restaurantId} />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {children}
      </main>
    </div>
  );
}
