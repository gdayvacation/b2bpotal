'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  CalendarClock,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  Ship,
  Users,
} from 'lucide-react'
import { AdminLogin } from '@/components/admin/admin-login'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const ADMIN_AUTH_KEY = 'gday-admin-auth'

const nav = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/bookings', label: 'Bookings', icon: ClipboardList },
  { href: '/admin/daily-board', label: 'Daily Board', icon: Ship },
  { href: '/admin/availability', label: 'Availability', icon: CalendarClock },
  { href: '/admin/agents', label: 'Agents', icon: Users },
  { href: '/admin/pickup-zones', label: 'Pickup Zones', icon: MapPin },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    setAuthed(sessionStorage.getItem(ADMIN_AUTH_KEY) === 'admin')
  }, [])

  function signIn() {
    sessionStorage.setItem(ADMIN_AUTH_KEY, 'admin')
    setAuthed(true)
  }

  function signOut() {
    sessionStorage.removeItem(ADMIN_AUTH_KEY)
    setAuthed(false)
  }

  if (authed === null) {
    return <div className="gday-app" />
  }

  if (!authed) {
    return <AdminLogin onSuccess={signIn} />
  }

  const current =
    nav.find((item) =>
      item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href),
    )?.label ?? 'Admin'

  return (
    <div className="gday-app relative">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-teal-900/6 bg-white/80 backdrop-blur-xl lg:flex lg:flex-col">
        <div className="flex h-16 items-center px-5">
          <Link href="/admin">
            <BrandMark />
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 pb-4">
          <p className="gday-soft-label px-3 py-2">Operations</p>
          {nav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="border-t border-teal-900/6 p-4">
          <div className="rounded-2xl bg-teal-950/[0.03] px-3.5 py-3">
            <p className="text-xs font-medium text-teal-950">Signed in as admin</p>
            <button
              type="button"
              onClick={signOut}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-800/70 transition-colors hover:text-teal-950"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-teal-900/6 bg-white/80 px-4 backdrop-blur-xl sm:h-16 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNav pathname={pathname} onSignOut={signOut} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-teal-950 lg:hidden">{current}</p>
              <p className="hidden text-sm text-teal-900/45 lg:block">
                Operations
                <span className="mx-2 text-teal-900/20">/</span>
                <span className="font-semibold text-teal-950">{current}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="hidden h-9 px-3 text-xs text-teal-800/70 sm:inline-flex"
              onClick={signOut}
            >
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
            <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-cyan-700 text-[11px] font-semibold text-white shadow-sm">
              AD
            </div>
          </div>
        </header>
        <main className="relative px-4 py-5 sm:py-7 lg:px-8">{children}</main>
      </div>
    </div>
  )
}

function NavLink({
  item,
  pathname,
}: {
  item: (typeof nav)[number]
  pathname: string
}) {
  const active = item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href)
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium transition-all',
        active
          ? 'bg-teal-800 text-white shadow-md shadow-teal-800/20'
          : 'text-teal-900/60 hover:bg-teal-950/[0.04] hover:text-teal-950',
      )}
    >
      <Icon className="size-4 shrink-0" strokeWidth={active ? 2.4 : 2} />
      {item.label}
    </Link>
  )
}

function MobileNav({ pathname, onSignOut }: { pathname: string; onSignOut: () => void }) {
  return (
    <Sheet>
      <SheetTrigger
        render={<Button variant="ghost" size="icon" className="size-10 rounded-xl lg:hidden" />}
      >
        <Menu className="size-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100%,18.5rem)] border-teal-900/8 bg-white/95">
        <SheetHeader>
          <SheetTitle>
            <BrandMark />
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-3">
          {nav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
        <div className="mt-auto border-t border-teal-900/8 px-4 py-4">
          <p className="text-sm font-semibold text-teal-950">admin</p>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-teal-800/70 transition-colors hover:text-teal-950"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
