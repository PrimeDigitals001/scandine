import type { Metadata } from "next";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatINR } from "@/lib/format";
import { getSalesReport } from "@/lib/admin/data";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = { title: "Admin · Reports" };

const RANGES = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
] as const;

const IST = 5.5 * 60 * 60 * 1000;

// Start-of-day IST for (today - (days-1)), returned as a UTC ISO string.
function rangeFrom(days: number): string {
  const istNow = new Date(Date.now() + IST);
  const istMidnight = Date.UTC(
    istNow.getUTCFullYear(),
    istNow.getUTCMonth(),
    istNow.getUTCDate(),
  );
  const fromIstMidnight = istMidnight - (days - 1) * 86_400_000;
  return new Date(fromIstMidnight - IST).toISOString();
}

const METHOD_LABEL: Record<string, string> = { cash: "Cash", upi: "UPI", card: "Card" };

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>;
}) {
  const { range } = await searchParams;
  const active = RANGES.find((r) => r.key === range) ?? RANGES[0];
  const report = await getSalesReport(rangeFrom(active.days), new Date().toISOString());

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">Sales report</h1>
        <p className="mt-0.5 text-sm text-muted">
          Paid bills only — complete, honest numbers for your records and your CA.
        </p>
      </div>

      {/* range tabs */}
      <div className="flex gap-2">
        {RANGES.map((r) => (
          <Link
            key={r.key}
            href={`/admin/reports?range=${r.key}`}
            className={cn(
              "rounded-pill px-3.5 py-1.5 text-sm font-semibold transition-colors active:scale-95",
              r.key === active.key ? "bg-ink text-white" : "bg-surface text-ink-soft hover:bg-canvas",
            )}
          >
            {r.label}
          </Link>
        ))}
      </div>

      {/* headline totals */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Orders paid" value={String(report.totals.count)} />
        <Stat label="Net sales (subtotal)" value={formatINR(report.totals.subtotal)} />
        <Stat label="Collected (incl. GST)" value={formatINR(report.totals.total)} accent />
      </div>

      {/* by payment method */}
      <Card flush className="overflow-hidden">
        <div className="border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-bold tracking-tight text-ink">By payment method</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-semibold">Method</th>
                <th className="px-4 py-2 text-right font-semibold">Orders</th>
                <th className="px-4 py-2 text-right font-semibold">Subtotal</th>
                <th className="px-4 py-2 text-right font-semibold">GST</th>
                <th className="px-4 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {report.byMethod.map((m) => (
                <tr key={m.method} className="border-b border-hairline/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-ink">{METHOD_LABEL[m.method]}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{m.count}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(m.subtotal)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-muted">{formatINR(m.gst)}</td>
                  <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{formatINR(m.total)}</td>
                </tr>
              ))}
              <tr className="bg-canvas/60 font-bold">
                <td className="px-4 py-2.5 text-ink">Total</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{report.totals.count}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(report.totals.subtotal)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{formatINR(report.totals.gst)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-success-strong">{formatINR(report.totals.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </Card>

      {/* top items */}
      <Card flush className="overflow-hidden">
        <div className="border-b border-hairline px-4 py-3">
          <h2 className="text-sm font-bold tracking-tight text-ink">Top items sold</h2>
        </div>
        {report.topItems.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No paid orders in this range yet.</p>
        ) : (
          <ul className="divide-y divide-hairline/60">
            {report.topItems.map((it, i) => (
              <li key={it.name} className="flex items-center gap-3 px-4 py-2.5">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-canvas text-xs font-bold text-muted tabular-nums">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{it.name}</span>
                <span className="shrink-0 text-sm text-muted tabular-nums">{it.qty} sold</span>
                <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                  {formatINR(it.revenue)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card>
      <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
      <p className={cn("mt-1 text-2xl font-bold tabular-nums", accent ? "text-success-strong" : "text-ink")}>
        {value}
      </p>
    </Card>
  );
}
