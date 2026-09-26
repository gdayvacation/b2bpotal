'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  CalendarClock,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
  QrCode,
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
  {
    href: '/admin',
    label: 'Dashboard',
    icon: LayoutDashboard,
    tone: 'bg-sky-100 text-sky-700 group-hover:bg-sky-200/80',
  },
  {
    href: '/admin/bookings',
    label: 'Booking',
    icon: ClipboardList,
    tone: 'bg-teal-100 text-teal-700 group-hover:bg-teal-200/80',
  },
  {
    href: '/admin/reports',
    label: 'Report',
    icon: FileSpreadsheet,
    tone: 'bg-orange-100 text-orange-700 group-hover:bg-orange-200/80',
  },
  {
    href: '/admin/daily-board',
    label: 'จัดการรถ / เรือ / ไกด์',
    icon: Ship,
    tone: 'bg-cyan-100 text-cyan-700 group-hover:bg-cyan-200/80',
  },
  {
    href: '/admin/check-in',
    label: 'Check-in',
    icon: QrCode,
    tone: 'bg-violet-100 text-violet-700 group-hover:bg-violet-200/80',
  },
  {
    href: '/admin/availability',
    label: 'Availability',
    icon: CalendarClock,
    tone: 'bg-amber-100 text-amber-700 group-hover:bg-amber-200/80',
  },
  {
    href: '/admin/agents',
    label: 'Agents',
    icon: Users,
    tone: 'bg-emerald-100 text-emerald-700 group-hover:bg-emerald-200/80',
  },
  {
    href: '/admin/pickup-zones',
    label: 'Pickup Zones',
    icon: MapPin,
    tone: 'bg-rose-100 text-rose-700 group-hover:bg-rose-200/80',
  },
] as const

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

  const current = billingLabel(pathname) ??
    nav.find((item) =>
      item.href === '/admin' ? pathname === '/admin' : pathname.startsWith(item.href),
    )?.label ?? 'Admin'

  return (
    <div className="gday-app relative">
      <aside className="gday-admin-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-teal-900/8 lg:flex lg:flex-col">
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
          <InvoiceReceiptNav pathname={pathname} />
        </nav>
        <div className="border-t border-teal-900/8 p-4">
          <div className="rounded-2xl bg-gradient-to-br from-teal-50 via-white to-sky-50 px-3.5 py-3 ring-1 ring-teal-900/6">
            <p className="text-xs font-medium text-teal-950">Signed in as admin</p>
            <button
              type="button"
              onClick={signOut}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700 transition-colors hover:text-teal-950"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-teal-900/8 bg-white/70 px-4 backdrop-blur-xl sm:h-16 lg:px-8">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-sky-400/50 via-teal-500/60 to-amber-400/40" />
          <div className="flex min-w-0 items-center gap-3">
            <MobileNav pathname={pathname} onSignOut={signOut} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-teal-950 lg:hidden">{current}</p>
              <p className="hidden text-sm text-teal-800/50 lg:block">
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
            <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 via-teal-500 to-cyan-700 text-[11px] font-semibold text-white shadow-md shadow-teal-600/25">
              AD
            </div>
          </div>
        </header>
        <main className="gday-admin-main relative px-4 py-5 sm:py-7 lg:px-8">{children}</main>
      </div>
    </div>
  )
}

function billingLabel(pathname: string) {
  if (pathname.startsWith('/admin/invoices/setup')) return 'Invoice setup'
  if (pathname.startsWith('/admin/invoices') || pathname.startsWith('/admin/receipts')) {
    return 'Invoice / Receipt'
  }
  return null
}

function InvoiceReceiptNav({ pathname }: { pathname: string }) {
  return (
    <Suspense fallback={<InvoiceReceiptLinks pathname={pathname} tab={null} />}>
      <InvoiceReceiptNavSearch pathname={pathname} />
    </Suspense>
  )
}

function InvoiceReceiptNavSearch({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams()
  return <InvoiceReceiptLinks pathname={pathname} tab={searchParams.get('tab')} />
}

function InvoiceReceiptLinks({
  pathname,
  tab,
}: {
  pathname: string
  tab: string | null
}) {
  const active = pathname.startsWith('/admin/invoices') || pathname.startsWith('/admin/receipts')
  const receiptActive =
    pathname.startsWith('/admin/receipts') ||
    (pathname.startsWith('/admin/invoices') && tab === 'receipts')
  const invoiceActive = active && !receiptActive

  return (
    <div
      className={cn(
        'flex items-center gap-0.5 rounded-2xl px-2 py-1.5 text-sm font-medium transition-all',
        active
          ? 'bg-gradient-to-r from-teal-700 to-cyan-700 text-white shadow-md shadow-teal-700/25'
          : 'text-teal-900/65 hover:bg-white/70 hover:text-teal-950',
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors',
          active ? 'bg-white/20 text-white' : 'bg-fuchsia-100 text-fuchsia-700',
        )}
      >
        <FileText className="size-4" strokeWidth={active ? 2.4 : 2} />
      </span>
      <Link
        href="/admin/invoices"
        className={cn(
          'rounded-xl px-2 py-1 transition-colors',
          invoiceActive ? 'bg-white/15 text-white' : active ? 'text-white/80 hover:text-white' : 'hover:text-teal-950',
        )}
      >
        Invoice
      </Link>
      <span className={active ? 'text-white/35' : 'text-teal-900/25'}>/</span>
      <Link
        href="/admin/invoices?tab=receipts"
        className={cn(
          'rounded-xl px-2 py-1 transition-colors',
          receiptActive ? 'bg-white/15 text-white' : active ? 'text-white/80 hover:text-white' : 'hover:text-teal-950',
        )}
      >
        Receipt
      </Link>
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
        'group flex items-center gap-3 rounded-2xl px-2.5 py-2 text-sm font-medium transition-all',
        active
          ? 'bg-gradient-to-r from-teal-700 to-cyan-700 text-white shadow-md shadow-teal-700/25'
          : 'text-teal-900/65 hover:bg-white/70 hover:text-teal-950',
      )}
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-xl transition-colors',
          active ? 'bg-white/20 text-white' : item.tone,
        )}
      >
        <Icon className="size-4" strokeWidth={active ? 2.4 : 2} />
      </span>
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
      <SheetContent side="left" className="gday-admin-sidebar w-[min(100%,18.5rem)] border-teal-900/8">
        <SheetHeader>
          <SheetTitle>
            <BrandMark />
          </SheetTitle>
        </SheetHeader>
        <div className="flex flex-col gap-1 px-3">
          {nav.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
          <InvoiceReceiptNav pathname={pathname} />
        </div>
        <div className="mt-auto border-t border-teal-900/8 px-4 py-4">
          <p className="text-sm font-semibold text-teal-950">admin</p>
          <button
            type="button"
            onClick={onSignOut}
            className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 transition-colors hover:text-teal-950"
          >
            <LogOut className="size-3.5" />
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
