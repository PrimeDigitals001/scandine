"use client";

import { useActionState } from "react";
import { AlertCircle, KeyRound } from "lucide-react";
import { createAdminAccount } from "@/lib/superadmin/actions";
import type { ActionState } from "@/lib/superadmin/types";
import { Button } from "@/components/ui/Button";
import { Input, PasswordInput, Field } from "@/components/ui/Input";
import { CopyButton } from "./CopyButton";

const initial: ActionState = {};

function CredRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-control bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate font-mono text-sm text-ink">{value}</p>
      </div>
      <CopyButton value={value} />
    </div>
  );
}

export function CreateAdminForm({ restaurantId }: { restaurantId: string }) {
  const [state, action, pending] = useActionState(createAdminAccount, initial);

  return (
    <div className="flex flex-col gap-3">
      <form action={action} className="grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="restaurant_id" value={restaurantId} />
        <Field label="Owner email" htmlFor="email" required>
          <Input id="email" name="email" type="email" placeholder="owner@cafe.com" required />
        </Field>
        <Field label="Full name" htmlFor="full_name" hint="Optional.">
          <Input id="full_name" name="full_name" placeholder="Café owner" />
        </Field>
        <Field
          label="Password"
          htmlFor="password"
          hint="Set one yourself, or leave blank to auto-generate a temporary one."
          className="sm:col-span-2"
        >
          <PasswordInput
            id="password"
            name="password"
            autoComplete="new-password"
            placeholder="Min 6 characters — or leave blank"
            minLength={6}
          />
        </Field>
        <div className="flex justify-end sm:col-span-2">
          <Button type="submit" loading={pending}>
            <KeyRound className="size-4" />
            Create owner login
          </Button>
        </div>
      </form>

      {state.error && (
        <p className="flex items-center gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger-strong">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      )}

      {state.ok && state.tempPassword && (
        <div className="rounded-card border border-success/30 bg-success-soft p-3">
          <p className="text-sm font-semibold text-success-strong">
            {state.manualPassword
              ? "Login created — share these with the café owner."
              : "Login created — copy these now, the password is shown only once."}
          </p>
          <div className="mt-2 flex flex-col gap-2">
            <CredRow label="Email" value={state.createdEmail ?? ""} />
            <CredRow label="Password" value={state.tempPassword} />
          </div>
          <p className="mt-2 text-xs text-success-strong/80">
            Share these with the café owner for{" "}
            <span className="font-mono">/admin</span>. They can change the
            password after first sign-in.
          </p>
        </div>
      )}
    </div>
  );
}
