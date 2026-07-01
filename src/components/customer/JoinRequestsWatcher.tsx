"use client";

import * as React from "react";
import { UserPlus, Check, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Mounted on the menu for whoever holds the table/seat session. Polls for
// pending "ask to join" requests and shows an Accept / Decline prompt.
interface Req {
  id: string;
  name: string;
}

// Best-effort attention: a short beep (Web Audio) + a phone vibration. Both are
// gated by browser autoplay/gesture policies, so the visual prompt stays the
// reliable channel — this just helps the table-holder notice.
function alertJoin() {
  try {
    navigator.vibrate?.([180, 90, 180]);
  } catch {
    /* unsupported (e.g. iOS) — ignore */
  }
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    const ac = new Ctx();
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.connect(gain);
    gain.connect(ac.destination);
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ac.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ac.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + 0.35);
    osc.start();
    osc.stop(ac.currentTime + 0.36);
    osc.onended = () => ac.close();
  } catch {
    /* audio blocked without a gesture — ignore */
  }
}

export function JoinRequestsWatcher({
  token,
  sessionToken,
}: {
  token: string;
  sessionToken: string;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const [requests, setRequests] = React.useState<Req[]>([]);
  const [busy, setBusy] = React.useState<string | null>(null);
  const seen = React.useRef<Set<string>>(new Set());

  React.useEffect(() => {
    let alive = true;
    const tick = async () => {
      const { data } = await supabase.rpc("list_join_requests", {
        p_token: token,
        p_session_token: sessionToken,
      });
      if (!alive || !Array.isArray(data)) return;
      const list = data as Req[];
      // alert (beep + vibrate) when a NEW request id shows up
      const fresh = list.some((r) => !seen.current.has(r.id));
      if (fresh) alertJoin();
      seen.current = new Set(list.map((r) => r.id));
      setRequests(list);
    };
    const iv = setInterval(tick, 4000);
    void tick();
    return () => {
      alive = false;
      clearInterval(iv);
    };
  }, [supabase, token, sessionToken]);

  async function respond(id: string, approve: boolean) {
    setBusy(id);
    await supabase.rpc("respond_join_request", {
      p_token: token,
      p_session_token: sessionToken,
      p_request_id: id,
      p_approve: approve,
    });
    setRequests((rs) => rs.filter((r) => r.id !== id));
    setBusy(null);
  }

  if (requests.length === 0) return null;

  return (
    <div className="fixed inset-x-0 top-3 z-40 mx-auto flex w-full max-w-md flex-col gap-2 px-4">
      {requests.map((r) => (
        <div
          key={r.id}
          className="animate-fade-in flex items-center gap-3 rounded-card border border-brand-200 bg-surface px-4 py-3 shadow-pop"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-500">
            <UserPlus className="size-4" />
          </span>
          <p className="min-w-0 flex-1 text-sm text-ink">
            <span className="font-semibold">{r.name}</span> wants to join your table
          </p>
          <button
            type="button"
            onClick={() => respond(r.id, false)}
            disabled={busy === r.id}
            aria-label="Decline"
            className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-sunken text-muted active:scale-90"
          >
            <X className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => respond(r.id, true)}
            disabled={busy === r.id}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-pill bg-brand-500 px-3.5 text-sm font-semibold text-white active:scale-95"
          >
            <Check className="size-4" /> Accept
          </button>
        </div>
      ))}
    </div>
  );
}
