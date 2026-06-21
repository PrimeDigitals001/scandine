"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { addCourtTables } from "@/lib/superadmin/fcActions";
import type { ActionState } from "@/lib/superadmin/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initial: ActionState = {};

export function AddCourtTablesForm({ courtId }: { courtId: string }) {
  const [state, action, pending] = useActionState(addCourtTables, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="court_id" value={courtId} />
      <div className="w-20">
        <label className="mb-1 block text-xs font-semibold text-ink-soft">Count</label>
        <Input name="count" type="number" min={1} max={100} defaultValue={5} required />
      </div>
      <div className="w-28">
        <label className="mb-1 block text-xs font-semibold text-ink-soft">Label prefix</label>
        <Input name="prefix" defaultValue="Table " />
      </div>
      <div className="w-20">
        <label className="mb-1 block text-xs font-semibold text-ink-soft">Seats each</label>
        <Input name="capacity" type="number" min={1} max={30} defaultValue={4} />
      </div>
      <Button type="submit" variant="outline" loading={pending}>
        Add tables
      </Button>
      {state.error && (
        <p className="flex w-full items-center gap-1.5 text-sm font-medium text-danger">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      )}
      {state.ok && <p className="w-full text-sm font-medium text-success-strong">Tables added ✓</p>}
    </form>
  );
}
