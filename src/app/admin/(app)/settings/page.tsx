import type { Metadata } from "next";
import { getAdminContext } from "@/lib/admin/context";
import { Card } from "@/components/ui/Card";
import { SettingsForm } from "./SettingsForm";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata: Metadata = { title: "Admin · Settings" };

export default async function SettingsPage() {
  const ctx = await getAdminContext();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Settings</h1>
        <p className="mt-0.5 text-sm text-muted">
          Your café profile, tax rates, and Google review link.
        </p>
      </div>
      <Card>
        <SettingsForm restaurant={ctx!.restaurant} />
      </Card>

      <div className="pt-1">
        <h2 className="mb-2 text-sm font-bold tracking-tight text-ink">
          Change your password
        </h2>
        <Card>
          <ChangePasswordForm />
        </Card>
      </div>
    </div>
  );
}
