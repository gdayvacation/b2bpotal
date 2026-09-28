'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { BrandMark } from '@/components/brand-mark'
import { AGENT_KEY_QUERY } from '@/lib/agent-access'
import { readStaffSession } from '@/lib/staff-auth'
import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'

async function partnerOwnsSlug(slug: string) {
  if (!hasSupabaseConfig()) return false
  const { data } = await getSupabaseBrowserClient().auth.getSession()
  const claim = String(data.session?.user.app_metadata?.agent_slug ?? '')
  const role = String(data.session?.user.app_metadata?.role ?? '')
  return role === 'partner' && claim === slug
}

async function applySession(accessToken?: string, refreshToken?: string) {
  if (!accessToken || !refreshToken || !hasSupabaseConfig()) return
  await getSupabaseBrowserClient().auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  })
}

export function AgentAccessGate({
  slug,
  children,
}: {
  slug: string
  children: React.ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [state, setState] = useState<'loading' | 'ok' | 'blocked'>('loading')
  const [message, setMessage] = useState('This booking link is not valid.')

  useEffect(() => {
    let cancelled = false

    async function unlock() {
      const staff = await readStaffSession()
      if (cancelled) return
      if (staff === 'admin') {
        setState('ok')
        return
      }
      if (await partnerOwnsSlug(slug)) {
        setState('ok')
        return
      }

      const keyFromUrl = searchParams.get(AGENT_KEY_QUERY)?.trim() || ''
      const response = await fetch('/api/agent/enter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, key: keyFromUrl || undefined }),
      })
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string
        accessToken?: string
        refreshToken?: string
      }
      if (cancelled) return
      if (!response.ok) {
        setMessage(payload.error || 'This booking link is not valid.')
        setState('blocked')
        return
      }

      await applySession(payload.accessToken, payload.refreshToken)
      if (!(await partnerOwnsSlug(slug))) {
        setMessage('This booking link is not valid.')
        setState('blocked')
        return
      }
      const reloadKey = `gday-agent-reloaded:${slug}`
      if (sessionStorage.getItem(reloadKey) !== '1') {
        sessionStorage.setItem(reloadKey, '1')
        if (keyFromUrl) router.replace(pathname)
        window.location.reload()
        return
      }
      if (keyFromUrl) router.replace(pathname)
      setState('ok')
    }

    void unlock()
    return () => {
      cancelled = true
    }
  }, [pathname, router, searchParams, slug])

  if (state === 'ok') return children

  return (
    <div className="gday-app relative flex min-h-dvh flex-col overflow-hidden">
      <div className="gday-grid pointer-events-none absolute inset-0 opacity-45" />
      <header className="relative mx-auto flex h-16 w-full max-w-md items-center px-4 sm:px-6">
        <BrandMark />
      </header>
      <main className="relative mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 pb-16 sm:px-6">
        <div className="gday-sheet rounded-[1.6rem] p-6 sm:p-8">
          <p className="gday-soft-label mb-2">Partner booking</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-teal-950">
            {state === 'loading' ? 'Opening your booking link…' : 'Link needed'}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-teal-950/55">
            {state === 'loading'
              ? 'Please wait a moment.'
              : message}
          </p>
          {state === 'blocked' ? (
            <p className="mt-3 text-sm text-teal-900/50">
              Ask Gday admin for the current private booking link. The old /agent name-only URL no
              longer opens the portal.
            </p>
          ) : null}
        </div>
      </main>
    </div>
  )
}
