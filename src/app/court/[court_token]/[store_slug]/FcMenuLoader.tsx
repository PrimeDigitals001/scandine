"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Lock, QrCode, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getSeatSession, setSeatSession, clearSeatSession } from "@/lib/customer/fcSession";
import type { FcStoreResolve } from "@/lib/customer/fcTypes";
import { AskToJoin } from "@/components/customer/AskToJoin";
import { FcMenuScreen } from "./FcMenuScreen";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "locked"; store?: string; label?: string }
  | { status: "ended" }
  | { status: "ready"; data: FcStoreResolve };

export function FcMenuLoader({
  token,
  storeSlug,
}: {
  token: string;
  storeSlug: string;
}) {
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const session = getSeatSession(token);
      const { data, error } = await supabase.rpc("resolve_food_court_store", {
        p_token: token,
        p_store_slug: storeSlug,
        p_session_token: session,
      });
      if (cancelled) return;
      if (error || !data) {
        setState({ status: "error" });
        return;
      }
      const d = data as FcStoreResolve;
      if (d.ended) {
        clearSeatSession(token);
        setState({ status: "ended" });
        return;
      }
      if (d.locked) {
        setState({ status: "locked", store: d.restaurant?.name, label: d.access?.label });
        return;
      }
      // shared-seat claim → persist the seat session for the rest of the visit
      if (d.session_token) setSeatSession(token, d.session_token);
      setState({ status: "ready", data: d });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, storeSlug]);

  if (state.status === "ended") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 grid size-16 place-items-center rounded-full bg-success-soft text-success-strong">
          <CheckCircle2 className="size-7" />
        </span>
        <h1 className="text-xl font-bold tracking-tight text-ink">This visit has ended</h1>
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
          The table has been cleared. Scan the QR code again to start a new order.
        </p>
        <Link href={`/court/${token}`} className="mt-5 text-sm font-semibold text-brand-600">
          Back to stores
        </Link>
      </div>
    );
  }

  if (state.status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-muted">
        <Loader2 className="size-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 grid size-16 place-items-center rounded-full bg-brand-50 text-brand-500">
          <QrCode className="size-7" />
        </span>
        <h1 className="text-xl font-bold tracking-tight text-ink">Store not found</h1>
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
          This store isn&apos;t available right now.
        </p>
        <Link href={`/court/${token}`} className="mt-5 text-sm font-semibold text-brand-600">
          Back to stores
        </Link>
      </div>
    );
  }

  if (state.status === "locked") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
        <span className="mb-4 grid size-16 place-items-center rounded-full bg-brand-50 text-brand-500">
          <Lock className="size-7" />
        </span>
        <h1 className="text-xl font-bold tracking-tight text-ink">
          {state.label ?? "This table"} is in use
        </h1>
        <p className="mt-1.5 max-w-xs text-sm leading-relaxed text-muted">
          Someone at this table already has an order open. Ask to join and they
          can let you in from their phone.
        </p>
        <AskToJoin
          token={token}
          onJoined={(s) => {
            setSeatSession(token, s);
            window.location.href = `/court/${token}/${storeSlug}`;
          }}
        />
        <Link href={`/court/${token}`} className="mt-4 text-sm font-semibold text-brand-600">
          Back to stores
        </Link>
      </div>
    );
  }

  return <FcMenuScreen token={token} storeSlug={storeSlug} data={state.data} />;
}
