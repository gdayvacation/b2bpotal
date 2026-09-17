'use client'

import { PortalProvider, usePortal } from '@/components/portal-provider'

function PortalLoadBanner() {
  const { hydrated, loadError } = usePortal()
  if (!hydrated) {
    return (
      <div className="fixed inset-x-0 top-0 z-[100] bg-teal-900/95 px-4 py-2.5 text-center text-xs font-medium text-white backdrop-blur-md">
        Loading portal data from Supabase…
      </div>
    )
  }
  if (!loadError) return null
  return (
    <div className="fixed inset-x-0 top-0 z-[100] bg-rose-700 px-4 py-2 text-center text-xs font-medium text-white">
      Could not load Supabase data: {loadError}
    </div>
  )
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PortalProvider>
      <PortalLoadBanner />
      {children}
    </PortalProvider>
  )
}
