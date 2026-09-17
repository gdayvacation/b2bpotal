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
    return <div className="min-h-screen bg-[var(--gday-canvas)]" />
  }

  if (!authed) {
    return <AdminLogin onSuccess={signIn} />
  }

  return (
    <div className="relative min-h-screen bg-[var(--gday-canvas)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(ellipse_at_top_left,_rgba(13,148,136,0.12),_transparent_55%)]" />
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-teal-900/8 bg-white/90 backdrop-blur-md lg:flex lg:flex-col">
        <div className="flex h-16 items-center border-b border-teal-900/6 px-5">
          <Link href="/admin">
            <BrandMark />
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3">
          <p className="px-3 py-2 text-[11px] font-semibold tracking-[0.16em] text-teal-700/50 uppercase">
            Operations
          </p>
          {nav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </nav>
        <div className="border-t border-teal-900/8 p-4">
          <p className="text-xs text-teal-800/50">Signed in as admin</p>
          <button
            type="button"
            onClick={signOut}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-teal-800/70 transition-colors hover:text-teal-950"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-teal-900/8 bg-white/85 px-4 backdrop-blur-md sm:h-16 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <MobileNav pathname={pathname} onSignOut={signOut} />
            <div className="truncate text-sm text-teal-900/50">
              Operations
              <span className="mx-2 text-teal-900/20">/</span>
              <span className="font-medium text-teal-950">
                {nav.find((item) =>
                  item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href),
                )?.label ?? 'Admin'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/admin/agents"
              className="hidden text-xs text-teal-800/60 transition-colors hover:text-teal-950 sm:inline"
            >
              Partner links
            </Link>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-xs text-teal-800/70" onClick={signOut}>
              <LogOut data-icon="inline-start" />
              Sign out
            </Button>
            <div className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-600 to-cyan-700 text-[11px] font-semibold text-white">
              AD
            </div>
          </div>
        </header>
        <main className="relative px-4 py-6 sm:py-8 lg:px-8">{children}</main>
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
        'flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors',
        active
          ? 'bg-teal-800 font-medium text-white shadow-md shadow-teal-800/15'
          : 'text-teal-900/65 hover:bg-teal-900/5',
      )}
    >
      <Icon className="size-4" />
      {item.label}
    </Link>
  )
}

function MobileNav({ pathname, onSignOut }: { pathname: string; onSignOut: () => void }) {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon" className="lg:hidden" />}>
        <Menu />
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(100%,18rem)] bg-white">
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
          <p className="text-sm font-medium text-teal-950">admin</p>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-teal-800/70 transition-colors hover:text-teal-950"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
