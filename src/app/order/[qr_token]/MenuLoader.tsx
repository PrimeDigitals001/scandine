"use client";

import * as React from "react";
import Link from "next/link";
import { QrCode, Lock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { EmptyState } from "@/components/ui/EmptyState";
import type { ResolveResult } from "@/lib/customer/types";
import { getSessionToken, setSessionToken } from "@/lib/customer/session";
import { AskToJoin } from "@/components/customer/AskToJoin";
import { MenuScreen } from "./MenuScreen";

type State =
  | { status: "loading" }
  | { status: "error" }
  | { status: "locked"; name: string; table: string }
  | { status: "ready"; data: ResolveResult; session: string };

export function MenuLoader({
  token,
  joinToken,
}: {
  token: string;
  joinToken?: string;
}) {
  const [state, setState] = React.useState<State>({ status: "loading" });

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // joining a friend's table via a share link → adopt their session token
      if (joinToken) setSessionToken(token, joinToken);
      const session = getSessionToken(token);
      const supabase = createClient();
      const { data, error } = await supabase.rpc("resolve_table", {
        p_qr_token: token,
        p_session_token: session,
      });
      if (cancelled) return;
      if (error || !data) {
        setState({ status: "error" });
        return;
      }
      if (data.locked) {
        setState({
          status: "locked",
          name: data.restaurant?.name ?? "this table",
          table: data.table?.table_number ?? "",
        });
        return;
      }
      if (data.session_token) setSessionToken(token, data.session_token);
      setState({ status: "ready", data: data as ResolveResult, session: data.session_token });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, joinToken]);

  if (state.status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center text-brand-500">
        <Loader2 className="size-7 animate-spin" />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <EmptyState
          icon={QrCode}
          title="This QR code isn't active"
          description="It may be old or the table was just cleared. Please ask the staff for a fresh code for your table."
        />
      </div>
    );
  }

  if (state.status === "locked") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="flex max-w-xs flex-col items-center text-center">
          <span className="mb-4 grid size-16 place-items-center rounded-full bg-brand-50 text-brand-500">
            <Lock className="size-7" />
          </span>
          <h1 className="text-xl font-bold tracking-tight text-ink">
            Table {state.table} is in use
          </h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            Someone at this table already has an order open. Ask to join and
            they can let you in from their phone.
          </p>
          <AskToJoin
            token={token}
            onJoined={(s) => {
              setSessionToken(token, s);
              window.location.href = `/order/${token}`;
            }}
          />
          <Link
            href={`/order/${token}`}
            className="mt-4 text-sm font-semibold text-brand-600"
          >
            Try again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <MenuScreen token={token} data={state.data} sessionToken={state.session} />
  );
}
