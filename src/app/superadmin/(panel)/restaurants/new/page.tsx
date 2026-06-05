import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { NewRestaurantForm } from "./NewRestaurantForm";

export const metadata: Metadata = { title: "Super Admin · New café" };

export default function NewRestaurantPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link
        href="/superadmin/restaurants"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Cafés
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">
          Onboard a café
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          Just the name is required — you can add tables, the owner login, and
          the menu next.
        </p>
      </div>

      <Card>
        <NewRestaurantForm />
      </Card>
    </div>
  );
}
