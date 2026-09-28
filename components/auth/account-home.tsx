'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { BRAND_SHORT } from '@/lib/brand'
import { clearPortalSession, readPortalSession } from '@/lib/portal-auth'
import { signOutPortalUser } from '@/lib/supabase/portal-users-db'
import type { PortalSession } from '@/lib/types'

export function AccountHome() {
  const router = useRouter()
  const [session, setSession] = useState<PortalSession | null | undefined>(undefined)

  useEffect(() => {
    const next = readPortalSession()
    setSession(next)
    if (!next) router.replace('/signin')
  }, [router])

  function signOut() {
    clearPortalSession()
    void signOutPortalUser().finally(() => router.replace('/signin'))
  }

  if (session === undefined) {
    return <div className="gday-app" />
  }

  if (!session) {
    return <div className="gday-app" />
  }

  return (
    <div className="gday-app relative flex flex-col overflow-hidden">
      <div className="gday-grid pointer-events-none absolute inset-0 opacity-45" />

      <header className="relative mx-auto flex h-16 w-full max-w-md items-center justify-between px-4 sm:px-6">
        <BrandMark />
        <Button variant="ghost" size="sm" className="h-9 px-3 text-xs text-teal-800/70" onClick={signOut}>
          <LogOut data-icon="inline-start" />
          Sign out
        </Button>
      </header>

      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <div className="gday-fade-up gday-sheet rounded-[1.6rem] p-6 sm:p-8">
          <p className="gday-soft-label mb-2">Partner account</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
            {session.name || session.userId}
          </h1>
          {session.email ? <p className="mt-1 text-sm text-teal-900/55">{session.email}</p> : null}
          {session.company ? (
            <p className="mt-0.5 text-sm text-teal-900/45">{session.company}</p>
          ) : null}
          {session.agentSlug ? (
            <p className="mt-0.5 text-sm text-teal-900/45">Agent · {session.agentSlug}</p>
          ) : null}
          <p className="mt-4 font-mono text-sm text-teal-800/80">User ID · {session.userId}</p>
          <p className="mt-5 text-[15px] leading-relaxed text-teal-950/55">
            Your login is ready. {BRAND_SHORT} has not opened agent booking on this portal yet —
            wait for admin to send access when it is time.
          </p>
        </div>

        <Link
          href="/"
          className="gday-fade-up delay-100 mt-6 text-sm font-medium text-teal-800/70 transition-colors hover:text-teal-950"
        >
          Back to portal
        </Link>
      </main>
    </div>
  )
}
