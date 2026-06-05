import { MenuItemSkeleton } from "@/components/ui/Skeleton";

export default function OrderLoading() {
  return (
    <div>
      <div className="bg-brand-500 px-4 pb-5 pt-6">
        <div className="h-3 w-24 rounded bg-white/30" />
        <div className="mt-2 h-6 w-44 rounded bg-white/30" />
      </div>
      <div className="flex gap-2 overflow-hidden px-4 py-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-24 shrink-0 rounded-pill bg-surface-sunken" />
        ))}
      </div>
      <div className="flex flex-col gap-3 px-4 pb-8">
        {Array.from({ length: 5 }).map((_, i) => (
          <MenuItemSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}
