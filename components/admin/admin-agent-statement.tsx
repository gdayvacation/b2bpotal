'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { useInvoiceStore } from '@/components/admin/use-invoice-store'
import { usePortal } from '@/components/portal-provider'
import { EmptyState, PageHeader, SoftLabel, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  formatInvoiceDate,
  formatInvoiceMoney,
  invoiceAmountForBooking,
  type InvoiceDocument,
} from '@/lib/invoice'
import { daysInMonthISO, formatMonthLabel, startOfThisMonth, toISODate } from '@/lib/format'
import { formatPaxBreakdown, type Booking } from '@/lib/types'
import { cn } from '@/lib/utils'

type StatementRow = {
  id: string
  date: string
  code: string
  guest: string
  program: string
  pax: string
  invoiceNo: string
  status: 'Paid' | 'Unpaid' | 'Open'
  amount: number
}

export function AdminAgentStatement({ onBack }: { onBack: () => void }) {
  const { agents, bookings, ensureBookingsForRange, hydrated } = usePortal()
  const store = useInvoiceStore()
  const [monthIso, setMonthIso] = useState(() => toISODate(startOfThisMonth()))
  const [agentSlug, setAgentSlug] = useState('')

  const monthObj = new Date(`${monthIso}T12:00:00`)
  const monthLabel = formatMonthLabel(monthIso)
  const monthPrefix = monthIso.slice(0, 7)

  useEffect(() => {
    if (!hydrated) return
    const days = daysInMonthISO(monthIso)
    const first = days[0]
    const last = days[days.length - 1]
    if (!first || !last) return
    void ensureBookingsForRange(first, last)
  }, [monthIso, hydrated, ensureBookingsForRange])

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const agent of agents) map.set(agent.slug, agent.name)
    for (const booking of bookings) {
      if (!map.has(booking.agentSlug)) map.set(booking.agentSlug, booking.agentName)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [agents, bookings])

  const resolvedSlug = agentSlug || agentOptions[0]?.[0] || ''
  const agentName =
    agentOptions.find(([slug]) => slug === resolvedSlug)?.[1] ?? resolvedSlug

  const rows = useMemo<StatementRow[]>(() => {
    if (!resolvedSlug) return []
    const monthBookings = bookings
      .filter((booking) => booking.agentSlug === resolvedSlug && booking.date.startsWith(monthPrefix))
      .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))

    return monthBookings.map((booking) => toStatementRow(booking, store.invoices))
  }, [bookings, monthPrefix, resolvedSlug, store.invoices])

  const invoicedRows = rows.filter((row) => row.status !== 'Open')
  const paidTotal = rows.filter((row) => row.status === 'Paid').reduce((sum, row) => sum + row.amount, 0)
  const unpaidTotal = rows.filter((row) => row.status === 'Unpaid').reduce((sum, row) => sum + row.amount, 0)
  const openTotal = rows.filter((row) => row.status === 'Open').reduce((sum, row) => sum + row.amount, 0)
  const billedTotal = paidTotal + unpaidTotal

  function shiftMonth(delta: number) {
    setMonthIso(toISODate(new Date(monthObj.getFullYear(), monthObj.getMonth() + delta, 1)))
  }

  function handlePrint() {
    if (rows.length === 0) return
    const previousTitle = document.title
    document.title = `Agent statement ${agentName} ${monthLabel}`
    let restored = false
    const restoreTitle = () => {
      if (restored) return
      restored = true
      document.title = previousTitle
      window.removeEventListener('afterprint', restoreTitle)
    }
    window.addEventListener('afterprint', restoreTitle)
    window.print()
    window.setTimeout(restoreTitle, 2000)
  }

  return (
    <div className="w-full">
      <div className="print:hidden">
        <div className="mb-4">
          <Button type="button" variant="ghost" size="sm" className="gap-1.5" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Report
          </Button>
        </div>

        <PageHeader
          title="Agent statement"
          description="Monthly billed vs open bookings for one agency — print for the partner or accounts."
          actions={
            <Button type="button" onClick={handlePrint} disabled={rows.length === 0}>
              <Printer data-icon="inline-start" />
              Print A4
            </Button>
          }
        />

        <Surface className="mb-5 p-4 sm:p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <SoftLabel>Month</SoftLabel>
              <div className="flex flex-wrap items-center gap-1">
                <Button type="button" variant="outline" size="icon-sm" onClick={() => shiftMonth(-1)}>
                  <ChevronLeft />
                </Button>
                <div className="min-w-[9.5rem] text-center text-sm font-semibold text-teal-950">
                  {monthLabel}
                </div>
                <Button type="button" variant="outline" size="icon-sm" onClick={() => shiftMonth(1)}>
                  <ChevronRight />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMonthIso(toISODate(startOfThisMonth()))}
                >
                  This month
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <SoftLabel htmlFor="statement-agent">Agent</SoftLabel>
              <select
                id="statement-agent"
                value={resolvedSlug}
                onChange={(event) => setAgentSlug(event.target.value)}
                className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm text-teal-950 outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
              >
                {agentOptions.map(([slug, name]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Surface>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Bookings" value={String(rows.length)} detail={monthLabel} />
          <SummaryCard label="Invoiced" value={formatInvoiceMoney(billedTotal)} detail={`${invoicedRows.length} bills`} />
          <SummaryCard label="Paid" value={formatInvoiceMoney(paidTotal)} detail="Receipts" />
          <SummaryCard label="Still open" value={formatInvoiceMoney(unpaidTotal + openTotal)} detail="Unpaid + not billed" />
        </div>

        <Surface className="overflow-hidden">
          {rows.length === 0 ? (
            <EmptyState>
              {resolvedSlug
                ? `No bookings for ${agentName} in ${monthLabel}.`
                : 'Add an agent to build a statement.'}
            </EmptyState>
          ) : (
            <StatementTable rows={rows} />
          )}
        </Surface>
      </div>

      <div className="statement-print-sheet hidden print:block">
        <div className="mb-3 flex items-end justify-between gap-4 border-b-2 border-teal-900/25 pb-2.5">
          <div>
            <p className="text-[10px] font-semibold tracking-[0.16em] text-teal-700/70 uppercase">
              G&apos;Day Tours Phuket · Agent statement
            </p>
            <h1 className="mt-0.5 text-lg font-bold text-teal-950">{agentName}</h1>
            <p className="mt-0.5 text-sm font-semibold text-teal-900">{monthLabel}</p>
          </div>
          <div className="text-right text-[11px] text-teal-900/65">
            <p>
              <span className="font-semibold text-teal-950">{rows.length}</span> bookings · invoiced{' '}
              <span className="font-semibold text-teal-950">{formatInvoiceMoney(billedTotal)}</span>
            </p>
            <p>
              Paid {formatInvoiceMoney(paidTotal)} · unpaid {formatInvoiceMoney(unpaidTotal)} · open{' '}
              {formatInvoiceMoney(openTotal)}
            </p>
          </div>
        </div>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">No bookings this month.</p>
        ) : (
          <table className="w-full text-left text-[10px] leading-tight">
            <thead>
              <tr className="bg-teal-950/[0.06]">
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold uppercase">Date</th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold uppercase">Code</th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold uppercase">Guest</th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold uppercase">Program</th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold uppercase">Pax</th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold uppercase">Invoice</th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold uppercase">Status</th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 text-right font-bold uppercase">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={cn(row.status === 'Open' && 'text-teal-900/55')}>
                  <td className="border border-teal-900/10 px-1.5 py-1">{formatInvoiceDate(row.date)}</td>
                  <td className="border border-teal-900/10 px-1.5 py-1 font-medium">{row.code}</td>
                  <td className="border border-teal-900/10 px-1.5 py-1">{row.guest}</td>
                  <td className="border border-teal-900/10 px-1.5 py-1">{row.program}</td>
                  <td className="border border-teal-900/10 px-1.5 py-1">{row.pax}</td>
                  <td className="border border-teal-900/10 px-1.5 py-1">{row.invoiceNo || '—'}</td>
                  <td className="border border-teal-900/10 px-1.5 py-1">{row.status}</td>
                  <td className="border border-teal-900/10 px-1.5 py-1 text-right tabular-nums">
                    {row.amount > 0 ? formatInvoiceMoney(row.amount) : '—'}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-teal-900/25 bg-teal-50/80 font-semibold">
                <td className="border border-teal-900/15 px-1.5 py-1.5" colSpan={7}>
                  Total
                </td>
                <td className="border border-teal-900/15 px-1.5 py-1.5 text-right tabular-nums">
                  {formatInvoiceMoney(billedTotal + openTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          html, body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          .statement-print-sheet,
          .statement-print-sheet * {
            visibility: visible !important;
          }
          .statement-print-sheet {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            z-index: 99999 !important;
          }
        }
      `}</style>
    </div>
  )
}

function StatementTable({ rows }: { rows: StatementRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Code</TableHead>
            <TableHead>Guest</TableHead>
            <TableHead>Program</TableHead>
            <TableHead>Pax</TableHead>
            <TableHead>Invoice</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className={cn(row.status === 'Open' && 'opacity-70')}>
              <TableCell className="whitespace-nowrap">{formatInvoiceDate(row.date)}</TableCell>
              <TableCell className="font-medium text-teal-950">{row.code}</TableCell>
              <TableCell>{row.guest}</TableCell>
              <TableCell>{row.program === 'James Bond' ? 'JB' : row.program}</TableCell>
              <TableCell className="text-xs">{row.pax}</TableCell>
              <TableCell>{row.invoiceNo || '—'}</TableCell>
              <TableCell>{row.status}</TableCell>
              <TableCell className="text-right tabular-nums">
                {row.amount > 0 ? formatInvoiceMoney(row.amount) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={7}>Total</TableCell>
            <TableCell className="text-right text-teal-950">{formatInvoiceMoney(total)}</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-rose-50/90 via-white to-white p-4 ring-1 ring-rose-900/8">
      <p className="text-xs font-medium text-rose-800/70">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-rose-950">
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-rose-900/45">{detail}</p>
    </div>
  )
}

function toStatementRow(booking: Booking, invoices: InvoiceDocument[]): StatementRow {
  const invoice = invoices.find(
    (doc) =>
      doc.kind === 'invoice' && doc.items.some((item) => item.bookingCode === booking.code),
  )
  const amount = invoice
    ? invoiceAmountForBooking(invoice, booking.code)
    : 0
  const status: StatementRow['status'] = invoice
    ? invoice.status === 'paid'
      ? 'Paid'
      : 'Unpaid'
    : 'Open'

  return {
    id: booking.code,
    date: booking.date,
    code: booking.code,
    guest: booking.leadGuest,
    program: booking.program,
    pax: formatPaxBreakdown(booking),
    invoiceNo: invoice?.number ?? '',
    status,
    amount,
  }
}
