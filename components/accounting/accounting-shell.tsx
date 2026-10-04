'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, FileSpreadsheet, FileText, LogOut, Menu, Ticket } from 'lucide-react'
import { AccountingLogin } from '@/components/accounting/accounting-login'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { logoutStaff, readStaffSession } from '@/lib/staff-auth'
import { cn } from '@/lib/utils'

const accountingItems = [
  {
    href: '/accounting',
    label: 'Invoice / Receipt',
    icon: FileText,
    tone: 'bg-fuchsia-100 text-fuchsia-700',
  },
  {
    href: '/accounting/allotments',
    label: 'Agent Allotment',
    icon: Ticket,
    tone: 'bg-amber-100 text-amber-700',
  },
] as const

function accountingItemActive(pathname: string, href: string) {
  if (href === '/accounting') {
    return pathname === '/accounting' || pathname.startsWith('/accounting/setup')
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

function currentPageLabel(pathname: string) {
  if (pathname.startsWith('/accounting/setup')) return 'Invoice setup'
  if (pathname.startsWith('/accounting/allotments')) return 'Agent Allotment'
  if (pathname.startsWith('/accounting/reports')) return 'Report'
  return 'Invoice / Receipt'
}

export function AccountingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    void readStaffSession().then((role) => {
      if (!cancelled) setAuthed(role === 'accounting')
    })
    return () => {
      cancelled = true
    }
  }, [])

  function signIn() {
    setAuthed(true)
  }

  function signOut() {
    void logoutStaff().then(() => setAuthed(false))
  }

  if (authed === null) {
    return <div className="gday-app" />
  }

  if (!authed) {
    return <AccountingLogin onSuccess={signIn} />
  }

  const current = currentPageLabel(pathname)

  return (
    <div className="gday-app relative">
      <aside className="gday-admin-sidebar fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-teal-900/8 lg:flex lg:flex-col">
        <div className="flex h-16 items-center px-5">
          <Link href="/accounting">
            <BrandMark />
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-1 px-3 pb-4">
          <p className="gday-soft-label px-3 py-2">Accounting / บัญชี</p>
          <AccountingGroup pathname={pathname} />
          <ReportNav pathname={pathname} />
        </nav>
        <div className="border-t border-teal-900/8 p-4">
          <div className="rounded-2xl bg-gradient-to-br from-teal-50 via-white to-sky-50 px-3.5 py-3 ring-1 ring-teal-900/6">
            <p className="text-xs font-medium text-teal-950">Signed in as account</p>
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
                Accounting
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
              AC
            </div>
          </div>
        </header>
        <main className="gday-admin-main relative px-3 py-4 sm:px-4 sm:py-7 lg:px-8">{children}</main>
      </div>
    </div>
  )
}

function AccountingGroup({ pathname }: { pathname: string }) {
  const active = !pathname.startsWith('/accounting/reports')
  return (
    <div>
      <div
        className={cn(
          'group flex items-center gap-3 rounded-2xl px-2.5 py-2 text-sm font-medium transition-all',
          active
            ? 'bg-gradient-to-r from-teal-700 to-cyan-700 text-white shadow-md shadow-teal-700/25'
            : 'text-teal-900/65',
        )}
      >
        <span
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-xl',
            active ? 'bg-white/20 text-white' : 'bg-fuchsia-100 text-fuchsia-700',
          )}
        >
          <FileText className="size-4" strokeWidth={active ? 2.4 : 2} />
        </span>
        <span className="flex-1">Accounting</span>
        <ChevronDown className={cn('size-4 shrink-0', active ? 'rotate-180 opacity-90' : 'opacity-50')} />
      </div>
      <div className="ml-4 mt-1 flex flex-col gap-0.5 border-l border-teal-900/10 pl-2">
        {accountingItems.map((item) => {
          const itemActive = accountingItemActive(pathname, item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors',
                itemActive
                  ? 'bg-white text-teal-950 shadow-sm ring-1 ring-teal-900/8'
                  : 'text-teal-900/70 hover:bg-white/80 hover:text-teal-950',
              )}
            >
              <span
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-lg',
                  itemActive ? item.tone : 'bg-white/70 text-teal-800/60',
                )}
              >
                <Icon className="size-3.5" strokeWidth={itemActive ? 2.4 : 2} />
              </span>
              {item.label}
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function ReportNav({ pathname }: { pathname: string }) {
  const active = pathname.startsWith('/accounting/reports')
  return (
    <Link
      href="/accounting/reports"
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
          active ? 'bg-white/20 text-white' : 'bg-orange-100 text-orange-700 group-hover:bg-orange-200/80',
        )}
      >
        <FileSpreadsheet className="size-4" strokeWidth={active ? 2.4 : 2} />
      </span>
      <span className="flex-1">Report</span>
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
          <p className="gday-soft-label px-1 py-2">Accounting / บัญชี</p>
          <AccountingGroup pathname={pathname} />
          <ReportNav pathname={pathname} />
        </div>
        <div className="mt-auto border-t border-teal-900/8 px-4 py-4">
          <p className="text-sm font-semibold text-teal-950">account</p>
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
