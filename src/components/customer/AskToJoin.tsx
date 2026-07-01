"use client";

import * as React from "react";
import { Loader2, UserPlus, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Shown on the "table in use" screen: lets a newcomer request to join, then
// polls for the table-holder's approval. On approval, hands the session token
// back via onJoined (the caller stores it as the table/seat session).
type Phase = "idle" | "waiting" | "denied" | "expired";

const genToken = () => {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now()}${Math.floor(Number(`0.${Date.now()}`.slice(2, 10)))}`;
  }
};

export function AskToJoin({
  token,
  onJoined,
}: {
  token: string;
  onJoined: (sessionToken: string) => void;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const reqRef = React.useRef<string>("");

  async function ask() {
    setError(null);
    const reqToken = genToken();
    reqRef.current = reqToken;
    const { error: e } = await supabase.rpc("request_to_join", {
      p_token: token,
      p_request_token: reqToken,
      p_name: name.trim() || null,
    });
    if (e) {
      setError(e.message || "Couldn't send the request.");
      return;
    }
    setPhase("waiting");
  }

  // poll for the outcome while waiting (approve/deny), with a ~90s timeout
  React.useEffect(() => {
    if (phase !== "waiting") return;
    let alive = true;
    const startedAt = Date.now();
    const tick = async () => {
      const { data } = await supabase.rpc("claim_join", {
        p_token: token,
        p_request_token: reqRef.current,
      });
      if (!alive) return;
      const status = (data as { status?: string; session_token?: string } | null)?.status;
      if (status === "approved" && data.session_token) {
        alive = false;
        onJoined(data.session_token);
      } else if (status === "denied") {
        setPhase("denied");
      } else if (status === "expired" || Date.now() - startedAt > 90_000) {
        setPhase("expired");
      }
    };
    const iv = setInterval(tick, 2000);
    void tick();
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [phase, supabase, token, onJoined]);

  if (phase === "waiting") {
    return (
      <div className="mt-5 w-full max-w-xs rounded-card border border-hairline bg-surface p-4 text-center">
        <Loader2 className="mx-auto size-6 animate-spin text-brand-500" />
        <p className="mt-2 text-sm font-semibold text-ink">Waiting to be let in…</p>
        <p className="mt-0.5 text-xs text-muted">
          Ask someone at the table to accept your request on their phone.
        </p>
      </div>
    );
  }

  if (phase === "denied" || phase === "expired") {
    return (
      <div className="mt-5 w-full max-w-xs rounded-card border border-hairline bg-surface p-4 text-center">
        <X className="mx-auto size-6 text-muted" />
        <p className="mt-2 text-sm font-semibold text-ink">
          {phase === "denied" ? "Request declined" : "No response yet"}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Ask them to share their table link, or try again.
        </p>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          className="mt-3 text-sm font-semibold text-brand-600"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="mt-5 w-full max-w-xs rounded-card border border-hairline bg-surface p-4">
      <p className="mb-2 text-center text-xs text-muted">or ask them to let you in:</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        placeholder="Your name"
        className="mb-2 h-10 w-full rounded-control border border-hairline bg-surface px-3 text-sm text-ink outline-none placeholder:text-faint focus:border-brand-400"
      />
      <button
        type="button"
        onClick={ask}
        className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-control bg-ink text-sm font-semibold text-white active:scale-95"
      >
        <UserPlus className="size-4" />
        Ask to join this table
      </button>
      {error && <p className="mt-2 text-center text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
