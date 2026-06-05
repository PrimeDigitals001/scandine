import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export default function RestaurantDetailLoading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-4 w-16" />

      {/* Header card */}
      <Card className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-52" />
            <Skeleton className="h-4 w-64" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-1 gap-3 border-t border-hairline pt-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </div>
      </Card>

      {/* Tables card */}
      <Card className="flex flex-col gap-4">
        <Skeleton className="h-5 w-44" />
        <Skeleton className="h-11 w-64" />
        <div className="grid gap-2 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      </Card>

      {/* Owner logins card */}
      <Card className="flex flex-col gap-4">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-20 w-full" />
      </Card>
    </div>
  );
}
