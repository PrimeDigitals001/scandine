"use client";

import * as React from "react";
import { useActionState } from "react";
import { AlertCircle, CheckCircle2, Printer } from "lucide-react";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import {
  generateBillAction,
  confirmPaymentAction,
  clearTableAction,
} from "@/lib/admin/actions";
import type { ActionState } from "@/lib/admin/types";
import type { BillingOrder } from "@/lib/admin/data";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { StatusChip } from "@/components/ui/StatusChip";
import { PriceTag } from "@/components/ui/PriceTag";

const round2 = (n: number) => Math.round(n * 100) / 100;
const empty: ActionState = {};

export interface Cafe {
  name: string;
  address: string | null;
  gstNumber: string | null;
}

const esc = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string,
  );

export function BillingCard({
  order,
  tax,
  cafe,
}: {
  order: BillingOrder;
  tax: { sgst: number; cgst: number };
  cafe: Cafe;
}) {
  const [genState, genAction, genPending] = useActionState(generateBillAction, empty);
  const [payState, payAction, payPending] = useActionState(confirmPaymentAction, empty);
  const [discount, setDiscount] = React.useState("0");

  const subtotal = order.items.reduce(
    (a, i) => a + Number(i.unit_price) * i.quantity,
    0,
  );
  const disc = Math.min(Math.max(Number(discount) || 0, 0), subtotal);
  const estSgst = round2((subtotal * tax.sgst) / 100);
  const estCgst = round2((subtotal * tax.cgst) / 100);
  const estTotal = round2(subtotal + estSgst + estCgst - disc);

  const bill = order.bill;
  const paid = bill && bill.payment_method !== "pending" && bill.paid_at;

  // Print a thermal-friendly receipt (80mm) via a hidden iframe so the OS print
  // dialog can target any printer, including a thermal receipt printer.
  function printReceipt() {
    const sub = bill ? Number(bill.subtotal) : subtotal;
    const sg = bill ? Number(bill.sgst) : estSgst;
    const cg = bill ? Number(bill.cgst) : estCgst;
    const dis = bill ? Number(bill.discount) : disc;
    const tot = bill ? Number(bill.total) : estTotal;
    const when = new Date().toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      dateStyle: "medium",
      timeStyle: "short",
    });
    const lines = order.items
      .map(
        (it) =>
          `<tr><td class="q">${it.quantity}×</td><td class="n">${esc(it.name_snapshot)}</td><td class="a">${esc(formatINR(Number(it.unit_price) * it.quantity))}</td></tr>`,
      )
      .join("");
    const row = (l: string, v: string, cls = "") =>
      `<div class="row ${cls}"><span>${l}</span><span>${v}</span></div>`;

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bill — Table ${esc(order.table_number)}</title><style>
@page { size: 80mm auto; margin: 4mm; }
* { box-sizing: border-box; }
body { width: 72mm; margin: 0 auto; font-family: ui-monospace,"Courier New",monospace; color:#000; font-size:12px; line-height:1.45; }
.c { text-align:center; } .name { font-size:15px; font-weight:700; } .muted { color:#222; font-size:11px; }
hr { border:none; border-top:1px dashed #000; margin:6px 0; }
table { width:100%; border-collapse:collapse; }
td.q { width:30px; vertical-align:top; } td.n { vertical-align:top; padding-right:6px; word-break:break-word; }
td.a { text-align:right; white-space:nowrap; vertical-align:top; }
.row { display:flex; justify-content:space-between; } .tot { font-weight:700; font-size:14px; }
.disc span:last-child { } .pay { text-align:center; font-weight:700; margin-top:6px; text-transform:capitalize; }
.foot { text-align:center; margin-top:10px; font-size:11px; }
</style></head><body>
<div class="c name">${esc(cafe.name)}</div>
${cafe.address ? `<div class="c muted">${esc(cafe.address)}</div>` : ""}
${cafe.gstNumber ? `<div class="c muted">GSTIN: ${esc(cafe.gstNumber)}</div>` : ""}
<hr>
${row(`Table ${esc(order.table_number)}`, esc(when))}
<hr>
<table>${lines}</table>
<hr>
${row("Item total", esc(formatINR(sub)))}
${row(`SGST (${tax.sgst}%)`, esc(formatINR(sg)))}
${row(`CGST (${tax.cgst}%)`, esc(formatINR(cg)))}
${dis > 0 ? row("Discount", `− ${esc(formatINR(dis))}`, "disc") : ""}
<hr>
${row("TOTAL", esc(formatINR(tot)), "tot")}
${bill && paid ? `<div class="pay">Paid via ${esc(bill.payment_method)}</div>` : ""}
<div class="foot">Thank you! Please visit again.<br>Powered by ScanDine</div>
</body></html>`;

    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, {
      position: "fixed",
      right: "0",
      bottom: "0",
      width: "0",
      height: "0",
      border: "0",
    });
    document.body.appendChild(iframe);
    const win = iframe.contentWindow;
    if (!win) {
      iframe.remove();
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.focus();
      win.print();
      setTimeout(() => iframe.remove(), 1000);
    }, 300);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-hairline/70 bg-surface shadow-card">
      {/* header */}
      <div className="flex items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <span className="text-lg font-bold tracking-tight text-ink">
          {order.food_court_id
            ? order.pickup_number != null
              ? `Food court · pickup #${order.pickup_number}`
              : "Food court · dine-in"
            : `Table ${order.table_number}`}
        </span>
        <StatusChip status={order.status} short />
      </div>

      {/* items */}
      <ul className="flex flex-col gap-1.5 px-4 py-3">
        {order.items.map((it) => (
          <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink-soft">
              <span className="font-semibold tabular-nums text-ink">
                {it.quantity}×{" "}
              </span>
              {it.name_snapshot}
            </span>
            <span className="tabular-nums text-ink">
              {formatINR(Number(it.unit_price) * it.quantity)}
            </span>
          </li>
        ))}
        {order.table_note && (
          <li className="pt-1 text-xs italic text-muted">
            Note: “{order.table_note}”
          </li>
        )}
      </ul>

      {/* totals + actions */}
      <div className="border-t border-hairline bg-canvas/40 px-4 py-3">
        {!bill ? (
          <>
            <Row label="Item total" value={formatINR(subtotal)} />
            <Row label={`SGST (${tax.sgst}%)`} value={formatINR(estSgst)} muted />
            <Row label={`CGST (${tax.cgst}%)`} value={formatINR(estCgst)} muted />
            <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2.5">
              <span className="font-bold text-ink">Total</span>
              <PriceTag amount={estTotal} size="lg" />
            </div>
            <form action={genAction} className="mt-3 flex items-end gap-2">
              <input type="hidden" name="order_id" value={order.id} />
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted">
                  Discount ₹
                </label>
                <Input
                  name="discount"
                  type="number"
                  min={0}
                  value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="h-10 w-24"
                />
              </div>
              <Button type="submit" loading={genPending} className="flex-1">
                Generate bill
              </Button>
            </form>
            {genState.error && <ErrorLine text={genState.error} />}
          </>
        ) : (
          <>
            <Row label="Item total" value={formatINR(bill.subtotal)} />
            <Row label={`SGST (${tax.sgst}%)`} value={formatINR(bill.sgst)} muted />
            <Row label={`CGST (${tax.cgst}%)`} value={formatINR(bill.cgst)} muted />
            {Number(bill.discount) > 0 && (
              <Row label="Discount" value={`− ${formatINR(bill.discount)}`} discount />
            )}
            <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2.5">
              <span className="font-bold text-ink">Total</span>
              <PriceTag amount={bill.total} size="lg" />
            </div>

            <button
              type="button"
              onClick={printReceipt}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-control border border-hairline bg-surface py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-canvas active:scale-95"
            >
              <Printer className="size-4" />
              Print bill
            </button>

            {paid ? (
              <div className="mt-3 flex flex-col gap-2">
                <p className="flex items-center justify-center gap-1.5 rounded-control bg-success-soft px-3 py-2 text-sm font-semibold capitalize text-success-strong">
                  <CheckCircle2 className="size-4" />
                  Paid via {bill.payment_method}
                </p>
                <form action={clearTableAction}>
                  <input type="hidden" name="order_id" value={order.id} />
                  <Button type="submit" variant="dark" size="lg" fullWidth>
                    Clear table &amp; reset QR
                  </Button>
                </form>
              </div>
            ) : (
              <form action={payAction} className="mt-3">
                <input type="hidden" name="bill_id" value={bill.id} />
                <p className="mb-2 text-xs font-medium text-muted">
                  Mark as paid:
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(["cash", "upi", "card"] as const).map((m) => (
                    <button
                      key={m}
                      type="submit"
                      name="payment_method"
                      value={m}
                      disabled={payPending}
                      className="rounded-control border border-hairline bg-surface py-2.5 text-sm font-semibold capitalize text-ink transition-colors hover:border-brand-300 hover:bg-brand-50 active:scale-95 disabled:opacity-50"
                    >
                      {m}
                    </button>
                  ))}
                </div>
                {payState.error && <ErrorLine text={payState.error} />}
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  muted,
  discount,
}: {
  label: string;
  value: string;
  muted?: boolean;
  discount?: boolean;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-sm">
      <span className={cn(muted ? "text-muted" : "text-ink-soft")}>{label}</span>
      <span
        className={cn(
          "tabular-nums",
          discount ? "text-danger" : muted ? "text-muted" : "text-ink",
        )}
      >
        {value}
      </span>
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
