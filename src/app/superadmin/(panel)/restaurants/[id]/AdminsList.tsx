"use client";

import * as React from "react";
import { useActionState } from "react";
import { KeyRound, AlertCircle } from "lucide-react";
import { resetAdminPasswordAction } from "@/lib/superadmin/actions";
import type { ActionState } from "@/lib/superadmin/types";
import type { StaffRow } from "@/lib/superadmin/data";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/Input";
import { CopyButton } from "./CopyButton";

const empty: ActionState = {};

export function AdminsList({
  admins,
  restaurantId,
}: {
  admins: StaffRow[];
  restaurantId: string;
}) {
  const [state, action, pending] = useActionState(resetAdminPasswordAction, empty);
  const [resetting, setResetting] = React.useState<string | null>(null);

  return (
    <ul className="flex flex-col gap-1.5">
      {admins.map((a) => (
        <li
          key={a.id}
          className="rounded-control border border-hairline bg-canvas/50 px-3 py-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">{a.email ?? "—"}</p>
              {a.full_name && <p className="truncate text-xs text-muted">{a.full_name}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={a.is_active ? "success" : "neutral"}>
                {a.is_active ? "active" : "disabled"}
              </Badge>
              <button
                type="button"
                onClick={() => setResetting((cur) => (cur === a.id ? null : a.id))}
                className="inline-flex items-center gap-1 rounded-control border border-hairline px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-canvas active:scale-95"
              >
                <KeyRound className="size-3.5" />
                Reset password
              </button>
            </div>
          </div>

          {/* inline chooser: type a password or leave blank to auto-generate */}
          {resetting === a.id && (
            <form
              action={action}
              className="mt-2 flex flex-wrap items-center gap-2 rounded-control bg-surface p-2"
            >
              <input type="hidden" name="user_id" value={a.id} />
              <input type="hidden" name="restaurant_id" value={restaurantId} />
              <div className="min-w-0 flex-1">
                <PasswordInput
                  name="password"
                  autoComplete="new-password"
                  placeholder="Type a new password — or leave blank to auto-generate"
                  minLength={6}
                  className="h-9"
                />
              </div>
              <Button size="sm" type="submit" loading={pending}>
                Set password
              </Button>
              <button
                type="button"
                onClick={() => setResetting(null)}
                className="rounded-control px-2 py-1 text-xs font-medium text-muted hover:text-ink"
              >
                Cancel
              </button>
            </form>
          )}

          {state.ok && state.resetUserId === a.id && state.tempPassword && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-control border border-success/30 bg-success-soft px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-success-strong">
                  {state.manualPassword ? "Password updated" : "New temporary password — shown once"}
                </p>
                <p className="truncate font-mono text-sm text-ink">{state.tempPassword}</p>
              </div>
              <CopyButton value={state.tempPassword} />
            </div>
          )}
          {state.error && state.resetUserId === a.id && (
            <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-danger">
              <AlertCircle className="size-4 shrink-0" />
              {state.error}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
