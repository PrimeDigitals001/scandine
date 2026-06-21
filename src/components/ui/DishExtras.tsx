import { Sparkles, Flame, Star } from "lucide-react";
import { cn } from "@/lib/cn";
import type { MenuItem } from "@/lib/customer/types";

// Shared menu-card bits so the single-café and food-court menus stay identical:
// the thumbnail (video / photo / letter-gradient), the special/bestseller
// badges, and the average-rating pill.

const GRADIENTS = [
  "from-brand-100 to-brand-200",
  "from-amber-100 to-orange-100",
  "from-rose-100 to-orange-100",
  "from-emerald-100 to-teal-100",
  "from-yellow-100 to-amber-100",
];
function gradientFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i)) % GRADIENTS.length;
  return GRADIENTS[h];
}

/** Video (muted autoplay loop) > photo > letter gradient. `sizeClass` sets dims. */
export function DishThumb({
  item,
  sizeClass = "size-20",
}: {
  item: Pick<MenuItem, "id" | "name" | "image_url" | "video_url">;
  sizeClass?: string;
}) {
  if (item.video_url) {
    return (
      <video
        src={item.video_url}
        className={cn("shrink-0 rounded-card object-cover", sizeClass)}
        muted
        loop
        autoPlay
        playsInline
        preload="metadata"
      />
    );
  }
  if (item.image_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={item.image_url}
        alt=""
        loading="lazy"
        className={cn("shrink-0 rounded-card object-cover", sizeClass)}
      />
    );
  }
  return (
    <div
      className={cn(
        "grid shrink-0 place-items-center rounded-card bg-gradient-to-br text-2xl font-bold text-brand-300",
        gradientFor(item.id),
        sizeClass,
      )}
      aria-hidden="true"
    >
      {item.name.charAt(0)}
    </div>
  );
}

/** Inline "Special" / "Bestseller" badges (render nothing if neither). */
export function DishBadges({
  item,
}: {
  item: Pick<MenuItem, "is_daily_special" | "is_bestseller">;
}) {
  if (!item.is_daily_special && !item.is_bestseller) return null;
  return (
    <>
      {item.is_daily_special && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-600">
          <Sparkles className="size-2.5" /> Special
        </span>
      )}
      {item.is_bestseller && (
        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-pill bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          <Flame className="size-2.5" /> Bestseller
        </span>
      )}
    </>
  );
}

/** Average-rating pill (nothing until there's at least one review). */
export function RatingPill({
  item,
}: {
  item: Pick<MenuItem, "avg_rating" | "rating_count">;
}) {
  if (!item.rating_count) return null;
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-medium text-muted">
      <Star className="size-3 fill-amber-400 text-amber-400" />
      <span className="tabular-nums text-ink">{item.avg_rating}</span>
      <span className="text-faint">({item.rating_count})</span>
    </span>
  );
}
