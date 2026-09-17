'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { CalendarDays, ClipboardList, Menu, Plus } from 'lucide-react'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { Agent } from '@/lib/types'

const nav = [
  { href: '', label: 'New Booking', icon: Plus },
  { href: '/bookings', label: 'My Bookings', icon: ClipboardList },
  { href: '/calendar', label: 'Calendar', icon: CalendarDays },
]

export function AgentShell({ agent, children }: { agent: Agent; children: React.ReactNode }) {
  const pathname = usePathname()
  const base = `/agent/${agent.slug}`

  return (
    <div className="relative min-h-screen bg-[var(--gday-canvas)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,_rgba(13,148,136,0.12),_transparent_70%)]" />
      <header className="sticky top-0 z-40 border-b border-teal-900/8 bg-white/85 backdrop-blur-md">
        <div className="relative mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:h-16 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <MobileNav agent={agent} pathname={pathname} />
            <Link href={base} className="min-w-0">
              <BrandMark />
            </Link>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {nav.map((item) => {
              const href = `${base}${item.href}`
              const active =
                item.href === ''
                  ? pathname === base ||
                    pathname.startsWith(`${base}/confirmed`) ||
                    pathname.startsWith(`${base}/voucher`)
                  : pathname.startsWith(href)
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={cn(
                    'rounded-full px-3.5 py-1.5 text-sm transition-all',
                    active
                      ? 'bg-teal-800 font-medium text-white shadow-md shadow-teal-800/20'
                      : 'text-teal-900/55 hover:bg-teal-900/5 hover:text-teal-950',
                  )}
                >
                  {item.label}
                </Link>
              )
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="hidden text-right sm:block">
              <div className="text-sm font-medium text-teal-950">{agent.name}</div>
              <div className="text-[11px] text-teal-800/55">{agent.country}</div>
            </div>
            <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-cyan-700 text-xs font-semibold text-white shadow-sm">
              {agent.name
                .split(' ')
                .slice(0, 2)
                .map((part) => part[0])
                .join('')}
            </div>
          </div>
        </div>
      </header>
      <main className="relative mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-10">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-teal-900/8 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="grid grid-cols-3 gap-1 px-2 py-2">
          {nav.map((item) => {
            const href = `${base}${item.href}`
            const Icon = item.icon
            const active =
              item.href === ''
                ? pathname === base ||
                  pathname.startsWith(`${base}/confirmed`) ||
                  pathname.startsWith(`${base}/voucher`)
                : pathname.startsWith(href)
            return (
              <Link
                key={item.href}
                href={href}
                className={cn(
                  'flex flex-col items-center gap-1 rounded-xl px-2 py-2 text-[11px] font-medium transition-colors',
                  active ? 'bg-teal-800 text-white' : 'text-teal-900/55',
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>
      <div className="h-20 md:hidden" />
    </div>
  )
}

function MobileNav({ agent, pathname }: { agent: Agent; pathname: string }) {
  const base = `/agent/${agent.slug}`
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="md:hidden" />}
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100%,18rem)] bg-white">
        <SheetHeader>
          <SheetTitle>
            <BrandMark />
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-3">
          {nav.map((item) => {
            const href = `${base}${item.href}`
            const Icon = item.icon
            const active =
              item.href === ''
                ? pathname === base ||
                  pathname.startsWith(`${base}/confirmed`) ||
                  pathname.startsWith(`${base}/voucher`)
                : pathname.startsWith(href)
            return (
              <SheetTrigger
                key={item.href}
                render={
                  <Link
                    href={href}
                    className={cn(
                      'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm',
                      active
                        ? 'bg-teal-800 text-white'
                        : 'text-teal-900/70 hover:bg-teal-900/5',
                    )}
                  />
                }
              >
                <Icon className="size-4" />
                {item.label}
              </SheetTrigger>
            )
          })}
        </div>
        <div className="mt-auto border-t border-teal-900/8 px-4 py-4 text-sm">
          <div className="font-medium text-teal-950">{agent.name}</div>
          <div className="text-teal-800/55">{agent.country}</div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
