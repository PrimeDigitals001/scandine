"use client";

import * as React from "react";
import { useActionState } from "react";
import { Plus, KeyRound, AlertCircle, Copy, Check, Trash2 } from "lucide-react";
import { cn } from "@/lib/cn";
import {
  createStaffAction,
  resetStaffPasswordAction,
  setStaffActiveAction,
  deleteStaffAction,
} from "@/lib/admin/actions";
import type { ActionState } from "@/lib/admin/types";
import type { StaffMember } from "@/lib/admin/data";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const empty: ActionState = {};

export function StaffManager({ staff }: { staff: StaffMember[] }) {
  const [createState, createAction, createPending] = useActionState(
    createStaffAction,
    empty,
  );
  const [resetState, resetAction, resetPending] = useActionState(
    resetStaffPasswordAction,
    empty,
  );

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Kitchen staff
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          Create logins for your kitchen team. They sign in at{" "}
          <span className="font-mono">/login</span> and land on the Kitchen
          Display.
        </p>
      </div>

      {/* Create */}
      <Card>
        <h2 className="mb-4 text-sm font-bold tracking-tight text-ink">
          Add a kitchen login
        </h2>
        <form action={createAction} className="grid gap-3 sm:grid-cols-2">
          <Field label="Email" htmlFor="email" required>
            <Input id="email" name="email" type="email" placeholder="cook@cafe.com" required />
          </Field>
          <Field label="Name" htmlFor="full_name" hint="Optional.">
            <Input id="full_name" name="full_name" placeholder="Ravi" />
          </Field>
          <div className="flex justify-end sm:col-span-2">
            <Button type="submit" loading={createPending}>
              <Plus className="size-4" />
              Create login
            </Button>
          </div>
        </form>
        {createState.error && <ErrorLine text={createState.error} />}
        {createState.ok && createState.tempPassword && (
          <CredBox
            email={createState.createdEmail}
            password={createState.tempPassword}
            note="Give these to your kitchen staff. The password is shown only once."
          />
        )}
      </Card>

      {/* Team */}
      <div>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          Team ({staff.length})
        </h2>
        {staff.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">
              No kitchen logins yet. Add one above.
            </p>
          </Card>
        ) : (
          <ul className="flex flex-col gap-2">
            {staff.map((s) => (
              <li
                key={s.id}
                className={cn(
                  "rounded-card border border-hairline/70 bg-surface p-3",
                  !s.is_active && "opacity-60",
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">
                      {s.email ?? "—"}
                    </p>
                    {s.full_name && (
                      <p className="truncate text-xs text-muted">{s.full_name}</p>
                    )}
                  </div>
                  <Badge tone={s.is_active ? "success" : "neutral"}>
                    {s.is_active ? "active" : "disabled"}
                  </Badge>

                  {/* reset password */}
                  <form action={resetAction}>
                    <input type="hidden" name="staff_id" value={s.id} />
                    <button
                      type="submit"
                      disabled={resetPending}
                      className="inline-flex items-center gap-1 rounded-control border border-hairline px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-canvas active:scale-95 disabled:opacity-50"
                      title="Reset password"
                    >
                      <KeyRound className="size-3.5" />
                      Reset
                    </button>
                  </form>

                  {/* enable / disable */}
                  <form action={setStaffActiveAction}>
                    <input type="hidden" name="staff_id" value={s.id} />
                    <input type="hidden" name="active" value={(!s.is_active).toString()} />
                    <button
                      type="submit"
                      className="rounded-control border border-hairline px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:bg-canvas active:scale-95"
                    >
                      {s.is_active ? "Disable" : "Enable"}
                    </button>
                  </form>

                  {/* delete */}
                  <form action={deleteStaffAction}>
                    <input type="hidden" name="staff_id" value={s.id} />
                    <button
                      type="submit"
                      onClick={(e) => {
                        if (!confirm(`Remove ${s.email}?`)) e.preventDefault();
                      }}
                      className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft hover:text-danger active:scale-95"
                      title="Remove"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>

                {resetState.ok &&
                  resetState.resetStaffId === s.id &&
                  resetState.tempPassword && (
                    <CredBox
                      password={resetState.tempPassword}
                      note="New password — share it, then it's gone."
                    />
                  )}
                {resetState.error && resetState.resetStaffId === undefined && (
                  <ErrorLine text={resetState.error} />
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CredBox({
  email,
  password,
  note,
}: {
  email?: string;
  password: string;
  note: string;
}) {
  return (
    <div className="mt-3 rounded-card border border-success/30 bg-success-soft p-3">
      <p className="mb-2 text-sm font-semibold text-success-strong">{note}</p>
      <div className="flex flex-col gap-2">
        {email && <CredRow label="Email" value={email} />}
        <CredRow label="Temporary password" value={password} />
      </div>
    </div>
  );
}

function CredRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center justify-between gap-2 rounded-control bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate font-mono text-sm text-ink">{value}</p>
      </div>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* ignore */
          }
        }}
        className="inline-flex shrink-0 items-center gap-1 rounded-control px-2 py-1 text-xs font-medium text-muted transition-colors hover:bg-canvas hover:text-ink active:scale-95"
      >
        {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

function ErrorLine({ text }: { text: string }) {
  return (
    <p className="mt-2 flex items-center gap-1.5 text-sm font-medium text-danger">
      <AlertCircle className="size-4 shrink-0" />
      {text}
    </p>
  );
}
