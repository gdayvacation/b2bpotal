'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ClipboardList, Plus } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { cn } from '@/lib/utils'
import type { Agent } from '@/lib/types'

const nav = [
  { href: '', label: 'Book', icon: Plus },
  { href: '/bookings', label: 'Bookings', icon: ClipboardList },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
]

export function AgentShell({ agent, children }: { agent: Agent; children: React.ReactNode }) {
  const pathname = usePathname()
  const base = `/agent/${agent.slug}`

  return (
    <div className="gday-app relative">
      <header className="sticky top-0 z-40 border-b border-teal-900/8 bg-white/70 backdrop-blur-xl">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-sky-400/50 via-teal-500/60 to-amber-400/40" />
        <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16 sm:px-6">
          <Link href={base} className="min-w-0 shrink-0">
            <BrandMark />
          </Link>

          <nav className="hidden items-center gap-1 rounded-full border border-teal-900/8 bg-gradient-to-r from-teal-950/[0.04] via-sky-950/[0.03] to-amber-950/[0.03] p-1 md:flex">
            {nav.map((item) => {
              const href = `${base}${item.href}`
              const active = isActive(pathname, base, item.href)
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-all',
                    active
                      ? 'bg-gradient-to-r from-teal-700 to-cyan-700 text-white shadow-sm shadow-teal-700/25'
                      : 'text-teal-900/55 hover:bg-white hover:text-teal-950',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex min-w-0 shrink-0 items-center gap-2.5 sm:gap-3">
            <div className="hidden min-w-0 text-right sm:block">
              <div className="truncate text-sm font-semibold text-teal-950">{agent.name}</div>
              <div className="text-[11px] text-teal-800/55">{agent.country}</div>
            </div>
            <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 via-teal-500 to-cyan-700 text-xs font-semibold text-white shadow-md shadow-teal-600/25">
              {agent.name
                .split(' ')
                .slice(0, 2)
                .map((part) => part[0])
                .join('')}
            </div>
          </div>
        </div>
      </header>

      <main className="relative mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">{children}</main>

      <nav
        data-mobile-nav
        className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:hidden"
      >
        <div className="mx-auto grid max-w-md grid-cols-3 gap-1 rounded-[1.4rem] border border-teal-900/8 bg-white/95 p-1.5 shadow-[0_12px_40px_-16px_rgba(11,36,34,0.45)] backdrop-blur-xl">
          {nav.map((item) => {
            const href = `${base}${item.href}`
            const Icon = item.icon
            const active = isActive(pathname, base, item.href)
            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  'flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-[1.05rem] text-[11px] font-semibold transition-all',
                  active
                    ? 'bg-gradient-to-br from-teal-700 to-cyan-700 text-white shadow-md shadow-teal-700/25'
                    : 'text-teal-900/50 active:bg-teal-950/[0.04]',
                )}
              >
                <Icon className="size-[18px]" strokeWidth={active ? 2.4 : 2} />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
      <div className="h-24 md:hidden" />
    </div>
  )
}

function isActive(pathname: string, base: string, href: string) {
  if (href === '') {
    return (
      pathname === base ||
      pathname.startsWith(`${base}/confirmed`) ||
      pathname.startsWith(`${base}/voucher`)
    )
  }
  return pathname.startsWith(`${base}${href}`)
}
