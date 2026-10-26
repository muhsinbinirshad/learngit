import { Link } from 'react-router-dom'
import { EmptyState } from '@/design-system/components'

export function NotFoundPage() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <EmptyState
        icon="explore_off"
        title="This page does not exist"
        description="The link may be out of date, or the lab it pointed at has moved."
        action={
          <Link
            to="/"
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-on-primary hover:bg-primary-hover hover:no-underline"
          >
            Back to tracks
          </Link>
        }
      />
    </div>
  )
}
