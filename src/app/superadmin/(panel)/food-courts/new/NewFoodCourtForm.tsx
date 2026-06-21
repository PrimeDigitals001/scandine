"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { createFoodCourt } from "@/lib/superadmin/fcActions";
import type { ActionState } from "@/lib/superadmin/types";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Field } from "@/components/ui/Input";

const initial: ActionState = {};

export function NewFoodCourtForm() {
  const [state, action, pending] = useActionState(createFoodCourt, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Food court name" htmlFor="name" required>
        <Input id="name" name="name" placeholder="Phoenix Mall Food Court" required autoFocus />
      </Field>

      <Field label="Address" htmlFor="address" hint="Optional.">
        <Textarea id="address" name="address" placeholder="Level 3, Phoenix Mall, Bengaluru" />
      </Field>

      {state.error && (
        <p className="flex items-center gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger-strong">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" loading={pending} size="lg">
          Create food court
        </Button>
      </div>
    </form>
  );
}
