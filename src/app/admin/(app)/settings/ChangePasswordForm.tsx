"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { changeOwnPasswordAction } from "@/lib/admin/actions";
import type { ActionState } from "@/lib/admin/types";
import { Button } from "@/components/ui/Button";
import { Input, Field } from "@/components/ui/Input";

const empty: ActionState = {};

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPasswordAction, empty);

  return (
    <form action={action} className="flex flex-col gap-4">
      <Field
        label="New password"
        htmlFor="password"
        hint="At least 6 characters. You'll use this next time you sign in."
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={6}
          placeholder="••••••••"
          required
        />
      </Field>

      {state.error && (
        <p className="flex items-center gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger-strong">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      )}
      {state.ok && (
        <p className="flex items-center gap-2 rounded-control bg-success-soft px-3 py-2 text-sm font-medium text-success-strong">
          <CheckCircle2 className="size-4 shrink-0" />
          Password updated.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" variant="dark" loading={pending}>
          Update password
        </Button>
      </div>
    </form>
  );
}
