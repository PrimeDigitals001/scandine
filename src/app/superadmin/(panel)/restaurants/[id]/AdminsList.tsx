"use client";

import { useActionState } from "react";
import { KeyRound, AlertCircle } from "lucide-react";
import { resetAdminPasswordAction } from "@/lib/superadmin/actions";
import type { ActionState } from "@/lib/superadmin/types";
import type { StaffRow } from "@/lib/superadmin/data";
import { Badge } from "@/components/ui/Badge";
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

  return (
    <ul className="flex flex-col gap-1.5">
      {admins.map((a) => (
        <li
          key={a.id}
          className="rounded-control border border-hairline bg-canvas/50 px-3 py-2"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {a.email ?? "—"}
              </p>
              {a.full_name && (
                <p className="truncate text-xs text-muted">{a.full_name}</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={a.is_active ? "success" : "neutral"}>
                {a.is_active ? "active" : "disabled"}
              </Badge>
              <form action={action}>
                <input type="hidden" name="user_id" value={a.id} />
                <input type="hidden" name="restaurant_id" value={restaurantId} />
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex items-center gap-1 rounded-control border border-hairline px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-canvas active:scale-95 disabled:opacity-50"
                >
                  <KeyRound className="size-3.5" />
                  Reset password
                </button>
              </form>
            </div>
          </div>

          {state.ok && state.resetUserId === a.id && state.tempPassword && (
            <div className="mt-2 flex items-center justify-between gap-2 rounded-control border border-success/30 bg-success-soft px-3 py-2">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-wide text-success-strong">
                  New temporary password — shown once
                </p>
                <p className="truncate font-mono text-sm text-ink">
                  {state.tempPassword}
                </p>
              </div>
              <CopyButton value={state.tempPassword} />
            </div>
          )}
          {state.error && state.resetUserId === undefined && (
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
