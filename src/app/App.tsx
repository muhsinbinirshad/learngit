import { lazy, Suspense } from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { AppShell } from './AppShell'
import { HomePage } from '@/features/dashboard/HomePage'
import { TrackPage, TracksIndex } from '@/features/tracks/TrackPage'
import { LessonPage } from '@/features/lessons/LessonPage'
import { NotFoundPage } from './NotFoundPage'
import { ToastViewport } from '@/design-system/components'
import { LabPageSkeleton } from '@/features/lab/LabPageSkeleton'
import { AchievementsPage, HubPage, SettingsPage } from '@/features/placeholders/PlaceholderPages'

const DesignPage = lazy(() => import('@/features/design/DesignPage').then((m) => ({ default: m.DesignPage })))
const LabPage = lazy(() => import('@/features/lab/LabPage').then((m) => ({ default: m.LabPage })))

const router = createBrowserRouter([
  {
    element: <AppShell />,
    errorElement: <NotFoundPage />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/tracks', element: <TracksIndex /> },
      { path: '/tracks/:trackId', element: <TrackPage /> },
      { path: '/lessons/:lessonId', element: <LessonPage /> },
      { path: '/achievements', element: <AchievementsPage /> },
      { path: '/hub', element: <HubPage /> },
      { path: '/settings', element: <SettingsPage /> },
      {
        path: '/design',
        element: (
          <Suspense fallback={<div className="p-8 text-sm text-on-surface-variant">Loading style guide…</div>}>
            <DesignPage />
          </Suspense>
        ),
      },
      {
        path: '/labs/:labId',
        element: (
          <Suspense fallback={<LabPageSkeleton />}>
            <LabPage />
          </Suspense>
        ),
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

export function App() {
  return (
    <>
      <RouterProvider router={router} />
      <ToastViewport />
    </>
  )
}
