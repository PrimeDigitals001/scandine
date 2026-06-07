"use client";

import * as React from "react";
import { useActionState } from "react";
import {
  Plus,
  Download,
  QrCode,
  Trash2,
  Copy,
  Check,
  AlertCircle,
} from "lucide-react";
import {
  addTablesAction,
  deleteTableAction,
  updateTableCapacityAction,
} from "@/lib/admin/actions";
import type { ActionState } from "@/lib/admin/types";
import type { TableFull } from "@/lib/admin/data";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const empty: ActionState = {};
const tone = { empty: "neutral", occupied: "warning", billing: "info" } as const;

export function TablesManager({
  tables,
  appUrl,
}: {
  tables: TableFull[];
  appUrl: string;
}) {
  const [addState, addAction, addPending] = useActionState(addTablesAction, empty);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink">Tables</h1>
          <p className="mt-0.5 text-sm text-muted">
            Add tables, then print their QR codes for each table.
          </p>
        </div>
        {tables.length > 0 && (
          <a
            href="/api/admin/qr-zip"
            className="inline-flex h-11 items-center gap-1.5 rounded-control bg-ink px-5 text-[15px] font-semibold text-white shadow-card transition active:scale-95"
          >
            <Download className="size-4" />
            Download all QRs (.zip)
          </a>
        )}
      </div>

      {/* Add tables */}
      <Card>
        <h2 className="mb-3 text-sm font-bold tracking-tight text-ink">
          Add tables
        </h2>
        <form action={addAction} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="count" className="text-xs font-medium text-muted">
              How many?
            </label>
            <Input id="count" name="count" type="number" min={1} max={50} defaultValue={4} className="w-24" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="prefix" className="text-xs font-medium text-muted">
              Label prefix
            </label>
            <Input id="prefix" name="prefix" defaultValue="T" maxLength={8} className="w-24" />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="capacity" className="text-xs font-medium text-muted">
              Seats each
            </label>
            <Input
              id="capacity"
              name="capacity"
              type="number"
              min={1}
              max={30}
              defaultValue={4}
              className="w-24"
            />
          </div>
          <Button type="submit" loading={addPending}>
            <Plus className="size-4" />
            Add
          </Button>
          {addState.error && (
            <span className="flex items-center gap-1 text-sm font-medium text-danger">
              <AlertCircle className="size-4" />
              {addState.error}
            </span>
          )}
        </form>
      </Card>

      {/* List */}
      {tables.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">
            No tables yet — add some above, then print the QR codes.
          </p>
        </Card>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {tables.map((t) => (
            <li
              key={t.id}
              className="flex items-center gap-3 rounded-card border border-hairline/70 bg-surface p-3"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-control bg-canvas text-ink">
                <QrCode className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-bold tracking-tight text-ink">
                    {t.table_number}
                  </span>
                  <Badge tone={tone[t.status]}>{t.status}</Badge>
                  <SeatsEditor id={t.id} capacity={t.capacity} />
                </div>
                <CopyUrl url={`${appUrl}/order/${t.qr_token}`} />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <a
                  href={`/api/admin/qr/${t.qr_token}`}
                  className="grid size-9 place-items-center rounded-control border border-hairline text-ink transition-colors hover:bg-canvas active:scale-95"
                  title="Download QR PNG"
                >
                  <Download className="size-4" />
                </a>
                <form action={deleteTableAction}>
                  <input type="hidden" name="table_id" value={t.id} />
                  <button
                    type="submit"
                    onClick={(e) => {
                      if (!confirm(`Delete ${t.table_number}?`)) e.preventDefault();
                    }}
                    className="grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-danger-soft hover:text-danger active:scale-95"
                    title="Delete table"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Inline seat editor — auto-saves on change (each table can have its own size).
function SeatsEditor({ id, capacity }: { id: string; capacity: number }) {
  const options = [1, 2, 3, 4, 5, 6, 8, 10, 12];
  if (!options.includes(capacity)) options.push(capacity);
  return (
    <form action={updateTableCapacityAction} className="flex items-center gap-1">
      <input type="hidden" name="table_id" value={id} />
      <label htmlFor={`cap-${id}`} className="sr-only">
        Seats
      </label>
      <select
        id={`cap-${id}`}
        name="capacity"
        defaultValue={capacity}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="rounded-control border border-hairline bg-surface py-0.5 pl-1.5 pr-0.5 text-xs text-ink outline-none focus:border-brand-400"
      >
        {options
          .sort((a, b) => a - b)
          .map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
      </select>
      <span className="text-xs text-muted">seats</span>
    </form>
  );
}

function CopyUrl({ url }: { url: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className="-ml-1.5 mt-0.5 inline-flex max-w-full items-center gap-1 rounded-control px-1.5 py-0.5 text-xs font-medium text-muted transition-colors hover:bg-canvas hover:text-ink active:scale-95"
    >
      {copied ? (
        <Check className="size-3 shrink-0 text-success" />
      ) : (
        <Copy className="size-3 shrink-0" />
      )}
      {copied ? "Copied!" : "Copy customer link"}
    </button>
  );
}
