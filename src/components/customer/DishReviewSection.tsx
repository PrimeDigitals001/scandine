"use client";

import * as React from "react";
import { Star, Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";
import { createClient } from "@/lib/supabase/client";

// "Rate your dishes" — shown on the status screen once an order is served.
// Submits per-dish reviews via the submit_dish_review RPC (works for single-café
// and food-court; the only difference is which session token is passed in).

interface ReviewItem {
  menu_item_id: string | null;
  name: string;
}

const doneKey = (orderId: string, miId: string) => `sd-dishrated-${orderId}-${miId}`;
const noopSubscribe = () => () => {};

export function DishReviewSection({
  orderId,
  items,
  sessionToken,
}: {
  orderId: string;
  items: ReviewItem[];
  sessionToken: string | null;
}) {
  // one row per distinct dish (an order can list the same dish on multiple lines)
  const dishes = React.useMemo(() => {
    const seen = new Set<string>();
    const out: { id: string; name: string }[] = [];
    for (const it of items) {
      if (it.menu_item_id && !seen.has(it.menu_item_id)) {
        seen.add(it.menu_item_id);
        out.push({ id: it.menu_item_id, name: it.name });
      }
    }
    return out;
  }, [items]);

  if (dishes.length === 0) return null;

  return (
    <div className="mt-4 rounded-card border border-hairline/70 bg-surface p-4">
      <h2 className="mb-1 text-sm font-bold tracking-tight text-ink">Rate your dishes</h2>
      <p className="mb-3 text-xs text-muted">Help others — tap the stars for each dish.</p>
      <ul className="divide-y divide-hairline">
        {dishes.map((d) => (
          <DishRow
            key={d.id}
            orderId={orderId}
            dishId={d.id}
            name={d.name}
            sessionToken={sessionToken}
          />
        ))}
      </ul>
    </div>
  );
}

function DishRow({
  orderId,
  dishId,
  name,
  sessionToken,
}: {
  orderId: string;
  dishId: string;
  name: string;
  sessionToken: string | null;
}) {
  const supabase = React.useMemo(() => createClient(), []);
  const persistedDone = React.useSyncExternalStore(
    noopSubscribe,
    () => {
      try {
        return !!window.localStorage.getItem(doneKey(orderId, dishId));
      } catch {
        return false;
      }
    },
    () => false,
  );
  const [stars, setStars] = React.useState(0);
  const [comment, setComment] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [submittedNow, setSubmittedNow] = React.useState(false);
  const [error, setError] = React.useState(false);

  const done = persistedDone || submittedNow;

  async function submit() {
    if (stars < 1) return;
    setSubmitting(true);
    setError(false);
    const { error: e } = await supabase.rpc("submit_dish_review", {
      p_order_id: orderId,
      p_menu_item_id: dishId,
      p_stars: stars,
      p_comment: comment.trim() || null,
      p_session_token: sessionToken,
    });
    setSubmitting(false);
    if (e) {
      setError(true);
      return;
    }
    try {
      window.localStorage.setItem(doneKey(orderId, dishId), String(stars));
    } catch {
      /* ignore */
    }
    setSubmittedNow(true);
  }

  if (done) {
    return (
      <li className="flex items-center justify-between gap-2 py-2.5">
        <span className="min-w-0 truncate text-sm text-ink">{name}</span>
        <span className="flex items-center gap-1 text-xs font-medium text-success-strong">
          <Check className="size-3.5" /> Rated
        </span>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-ink">{name}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? "s" : ""}`}
              onClick={() => setStars(n)}
              className="p-0.5 active:scale-90"
            >
              <Star
                className={cn(
                  "size-5",
                  n <= stars ? "fill-amber-400 text-amber-400" : "text-hairline",
                )}
              />
            </button>
          ))}
        </div>
      </div>
      {stars > 0 && (
        <div className="flex items-center gap-2">
          <input
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={160}
            placeholder="Add a comment (optional)"
            className="h-9 min-w-0 flex-1 rounded-control border border-hairline bg-surface px-3 text-sm text-ink outline-none placeholder:text-faint focus:border-brand-400"
          />
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-control bg-ink px-3 text-sm font-semibold text-white active:scale-95"
          >
            {submitting ? <Loader2 className="size-4 animate-spin" /> : "Submit"}
          </button>
        </div>
      )}
      {error && <p className="text-xs font-medium text-danger">Couldn&apos;t submit — try again.</p>}
    </li>
  );
}
