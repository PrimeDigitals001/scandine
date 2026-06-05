"use client";

import { useActionState } from "react";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { updateSettingsAction } from "@/lib/admin/actions";
import type { ActionState } from "@/lib/admin/types";
import type { AdminRestaurant } from "@/lib/admin/context";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Field } from "@/components/ui/Input";

const empty: ActionState = {};

export function SettingsForm({ restaurant }: { restaurant: AdminRestaurant }) {
  const [state, action, pending] = useActionState(updateSettingsAction, empty);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="restaurant_id" value={restaurant.id} />

      <Field label="Café name" htmlFor="name" hint="Contact ScanDine to change this.">
        <Input id="name" value={restaurant.name} disabled />
      </Field>

      <Field label="Address" htmlFor="address" hint="Shown on the customer bill.">
        <Textarea
          id="address"
          name="address"
          defaultValue={restaurant.address ?? ""}
          placeholder="14, MG Road, Indiranagar, Bengaluru 560038"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="GST number" htmlFor="gst_number">
          <Input
            id="gst_number"
            name="gst_number"
            defaultValue={restaurant.gst_number ?? ""}
            placeholder="29ABCDE1234F1Z5"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SGST %" htmlFor="sgst">
            <Input
              id="sgst"
              name="sgst"
              type="number"
              min={0}
              max={50}
              step="0.5"
              defaultValue={restaurant.tax_config.sgst}
            />
          </Field>
          <Field label="CGST %" htmlFor="cgst">
            <Input
              id="cgst"
              name="cgst"
              type="number"
              min={0}
              max={50}
              step="0.5"
              defaultValue={restaurant.tax_config.cgst}
            />
          </Field>
        </div>
      </div>

      <Field
        label="Google review URL"
        htmlFor="google_review_url"
        hint="From Google Maps → Share → Copy link. Powers the customer rating prompt."
      >
        <Input
          id="google_review_url"
          name="google_review_url"
          type="url"
          defaultValue={restaurant.google_review_url ?? ""}
          placeholder="https://search.google.com/local/writereview?placeid=..."
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
          Settings saved.
        </p>
      )}

      <div className="flex justify-end">
        <Button type="submit" size="lg" loading={pending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
