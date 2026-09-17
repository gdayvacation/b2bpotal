'use client'

import { PortalProvider } from '@/components/portal-provider'

export function Providers({ children }: { children: React.ReactNode }) {
  return <PortalProvider>{children}</PortalProvider>
}
