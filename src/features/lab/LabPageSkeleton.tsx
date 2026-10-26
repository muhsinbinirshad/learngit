import { Skeleton, SkeletonText } from '@/design-system/components'

export function LabPageSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label="Loading lab">
      <div className="flex h-12 items-center gap-4 border-b border-outline px-4">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-4 w-24" />
        <div className="ml-auto flex gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-8" />
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="w-[26%] border-r border-outline p-4">
          <Skeleton className="mb-3 h-5 w-48" />
          <SkeletonText lines={6} />
        </div>
        <div className="flex w-[46%] flex-col border-r border-outline">
          <div className="flex-1 p-4">
            <SkeletonText lines={4} />
          </div>
          <div className="h-[45%] bg-terminal-bg" />
        </div>
        <div className="w-[28%] p-4">
          <Skeleton className="mb-3 h-5 w-32" />
          <SkeletonText lines={8} />
        </div>
      </div>
    </div>
  )
}
