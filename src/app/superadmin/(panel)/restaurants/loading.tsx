import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export default function RestaurantsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-11 w-28" />
      </div>

      <Card flush className="overflow-hidden">
        <div className="flex flex-col gap-4 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="hidden h-4 w-10 sm:block" />
              <Skeleton className="hidden h-4 w-10 sm:block" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
