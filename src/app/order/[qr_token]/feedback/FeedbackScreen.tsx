"use client";

import * as React from "react";
import { Star, Heart, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { buttonVariants } from "@/components/ui/Button";

export function FeedbackScreen({
  name,
  googleReviewUrl,
}: {
  name: string;
  googleReviewUrl: string | null;
}) {
  const [rating, setRating] = React.useState(0);
  const [hover, setHover] = React.useState(0);

  const happy = rating >= 4;
  const chosen = rating > 0;

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-24 md:max-w-2xl">
      {/* Hero */}
      <div className="bg-brand-500 px-5 pb-8 pt-8 text-center text-white">
        <span className="mx-auto mb-3 grid size-14 place-items-center rounded-full bg-white/15">
          <Heart className="size-7" />
        </span>
        <h1 className="text-2xl font-bold tracking-tight">How was it?</h1>
        <p className="mt-1 text-sm text-white/85">
          Your feedback helps {name} get better.
        </p>
      </div>

      <div className="flex flex-1 flex-col items-center px-6 py-8">
        {/* Stars */}
        <div className="flex items-center gap-1.5">
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = (hover || rating) >= n;
            return (
              <button
                key={n}
                type="button"
                aria-label={`${n} star${n > 1 ? "s" : ""}`}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                onMouseLeave={() => setHover(0)}
                className="p-1 transition-transform active:scale-90"
              >
                <Star
                  className={cn(
                    "size-10 transition-colors",
                    filled ? "fill-warning text-warning" : "text-hairline",
                  )}
                />
              </button>
            );
          })}
        </div>

        {/* Response */}
        {!chosen && (
          <p className="mt-5 text-center text-sm text-muted">
            Tap a star to rate your experience.
          </p>
        )}

        {chosen && happy && (
          <div className="mt-6 w-full text-center">
            <p className="text-lg font-bold tracking-tight text-ink">
              So glad you enjoyed it! 🎉
            </p>
            <p className="mt-1 text-sm text-muted">
              Would you share it on Google? It means a lot to a small café.
            </p>
            {googleReviewUrl ? (
              <a
                href={googleReviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonVariants({
                  size: "lg",
                  fullWidth: true,
                  className: "mt-5",
                })}
              >
                <Star className="size-4 fill-current" />
                Rate us on Google
                <ExternalLink className="size-4" />
              </a>
            ) : (
              <p className="mt-5 text-sm text-muted">
                Thanks for the love — please tell our staff!
              </p>
            )}
          </div>
        )}

        {chosen && !happy && (
          <div className="mt-6 w-full text-center">
            <p className="text-lg font-bold tracking-tight text-ink">
              Sorry it wasn&apos;t perfect.
            </p>
            <p className="mt-1 text-sm text-muted">
              Please flag a staff member at your table — we&apos;d love to make
              it right before you leave.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
