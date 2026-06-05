import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";

export default function DashboardLoading() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-11 w-28" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="flex flex-col gap-3">
            <Skeleton circle className="size-9" />
            <Skeleton className="h-7 w-12" />
            <Skeleton className="h-3 w-16" />
          </Card>
        ))}
      </div>

      <Card flush className="overflow-hidden">
        <div className="border-b border-hairline px-4 py-3">
          <Skeleton className="h-4 w-28" />
        </div>
        <div className="flex flex-col gap-4 p-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="flex flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-44" />
                <Skeleton className="h-3 w-28" />
              </div>
              <Skeleton className="hidden h-4 w-10 sm:block" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
