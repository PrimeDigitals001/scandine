"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { addTables } from "@/lib/superadmin/actions";
import type { ActionState } from "@/lib/superadmin/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initial: ActionState = {};

export function AddTablesForm({ restaurantId }: { restaurantId: string }) {
  const [state, action, pending] = useActionState(addTables, initial);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="restaurant_id" value={restaurantId} />
      <div className="flex flex-col gap-1">
        <label htmlFor="count" className="text-xs font-medium text-muted">
          How many?
        </label>
        <Input
          id="count"
          name="count"
          type="number"
          min={1}
          max={50}
          defaultValue={4}
          className="w-24"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="prefix" className="text-xs font-medium text-muted">
          Label prefix
        </label>
        <Input id="prefix" name="prefix" defaultValue="T" maxLength={8} className="w-24" />
      </div>
      <Button type="submit" variant="outline" loading={pending}>
        Add tables
      </Button>
      {state.error && (
        <span className="flex items-center gap-1 text-sm font-medium text-danger">
          <AlertCircle className="size-4" />
          {state.error}
        </span>
      )}
    </form>
  );
}
