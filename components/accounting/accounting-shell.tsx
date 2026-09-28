'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { FileText, LogOut, Menu } from 'lucide-react'
import { AccountingLogin } from '@/components/accounting/accounting-login'
import { BrandMark } from '@/components/brand-mark'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { logoutStaff, readStaffSession } from '@/lib/staff-auth'
import { cn } from '@/lib/utils'

function currentPageLabel(pathname: string, tab: string | null) {
  if (pathname.startsWith('/accounting/setup')) return 'Invoice setup'
  return tab === 'receipts' ? 'Receipt' : 'Invoice'
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
          <Suspense fallback={<InvoiceReceiptNav tab={null} />}>
            <InvoiceReceiptNavSearch />
          </Suspense>
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
            <MobileNav onSignOut={signOut} />
            <Suspense fallback={<HeaderLabel pathname={pathname} tab={null} />}>
              <HeaderLabelSearch pathname={pathname} />
            </Suspense>
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

function HeaderLabelSearch({ pathname }: { pathname: string }) {
  const searchParams = useSearchParams()
  return <HeaderLabel pathname={pathname} tab={searchParams.get('tab')} />
}

function HeaderLabel({ pathname, tab }: { pathname: string; tab: string | null }) {
  const current = currentPageLabel(pathname, tab)
  return (
    <div className="min-w-0">
      <p className="truncate text-sm font-semibold text-teal-950 lg:hidden">{current}</p>
      <p className="hidden text-sm text-teal-800/50 lg:block">
        Accounting
        <span className="mx-2 text-teal-900/20">/</span>
        <span className="font-semibold text-teal-950">{current}</span>
      </p>
    </div>
  )
}

function InvoiceReceiptNavSearch() {
  const searchParams = useSearchParams()
  return <InvoiceReceiptNav tab={searchParams.get('tab')} />
}

function InvoiceReceiptNav({ tab }: { tab: string | null }) {
  const receiptActive = tab === 'receipts'
  const invoiceActive = !receiptActive

  return (
    <div className="flex items-center gap-0.5 rounded-2xl bg-gradient-to-r from-teal-700 to-cyan-700 px-2 py-1.5 text-sm font-medium text-white shadow-md shadow-teal-700/25">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-white/20 text-white">
        <FileText className="size-4" strokeWidth={2.4} />
      </span>
      <Link
        href="/accounting"
        className={cn('rounded-xl px-2 py-1 transition-colors', invoiceActive ? 'bg-white/15 text-white' : 'text-white/80 hover:text-white')}
      >
        Invoice
      </Link>
      <span className="text-white/35">/</span>
      <Link
        href="/accounting?tab=receipts"
        className={cn('rounded-xl px-2 py-1 transition-colors', receiptActive ? 'bg-white/15 text-white' : 'text-white/80 hover:text-white')}
      >
        Receipt
      </Link>
    </div>
  )
}

function MobileNav({ onSignOut }: { onSignOut: () => void }) {
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
          <Suspense fallback={<InvoiceReceiptNav tab={null} />}>
            <InvoiceReceiptNavSearch />
          </Suspense>
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
