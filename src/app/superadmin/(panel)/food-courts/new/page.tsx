import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { NewFoodCourtForm } from "./NewFoodCourtForm";

export const metadata: Metadata = { title: "Super Admin · New food court" };

export default function NewFoodCourtPage() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <Link
        href="/superadmin/food-courts"
        className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-muted hover:text-ink"
      >
        <ArrowLeft className="size-4" />
        Food courts
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Create a food court</h1>
        <p className="mt-0.5 text-sm text-muted">
          Just the name to start — then attach stores and download the court QR.
        </p>
      </div>

      <Card>
        <NewFoodCourtForm />
      </Card>
    </div>
  );
}
