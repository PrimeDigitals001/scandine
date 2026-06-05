"use client";

import { useActionState } from "react";
import { AlertCircle } from "lucide-react";
import { createRestaurant } from "@/lib/superadmin/actions";
import type { ActionState } from "@/lib/superadmin/types";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select, Field } from "@/components/ui/Input";

const initial: ActionState = {};

export function NewRestaurantForm() {
  const [state, action, pending] = useActionState(createRestaurant, initial);

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field label="Café name" htmlFor="name" required>
        <Input id="name" name="name" placeholder="Friends & Fries Café" required autoFocus />
      </Field>

      <Field
        label="Address"
        htmlFor="address"
        hint="Shown on the bill. Optional."
      >
        <Textarea
          id="address"
          name="address"
          placeholder="14, MG Road, Indiranagar, Bengaluru 560038"
        />
      </Field>

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="GST number" htmlFor="gst_number" hint="Optional.">
          <Input id="gst_number" name="gst_number" placeholder="29ABCDE1234F1Z5" />
        </Field>
        <Field label="Plan" htmlFor="subscription_plan">
          <Select id="subscription_plan" name="subscription_plan" defaultValue="free">
            <option value="free">Free</option>
            <option value="starter">Starter</option>
            <option value="pro">Pro</option>
          </Select>
        </Field>
      </div>

      <Field
        label="Google review URL"
        htmlFor="google_review_url"
        hint="From Google Maps → Share → Copy link. Powers the rating prompt. Optional."
      >
        <Input
          id="google_review_url"
          name="google_review_url"
          type="url"
          placeholder="https://search.google.com/local/writereview?placeid=..."
        />
      </Field>

      <Field label="Billing mode" htmlFor="pos_mode">
        <Select id="pos_mode" name="pos_mode" defaultValue="standalone">
          <option value="standalone">Standalone — ScanDine generates the bill</option>
          <option value="pos_integrated">POS-integrated — send orders to their POS</option>
        </Select>
      </Field>

      {state.error && (
        <p className="flex items-center gap-2 rounded-control bg-danger-soft px-3 py-2 text-sm font-medium text-danger-strong">
          <AlertCircle className="size-4 shrink-0" />
          {state.error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="submit" loading={pending} size="lg">
          Create café
        </Button>
      </div>
    </form>
  );
}
