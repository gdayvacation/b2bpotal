'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from 'cn'
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarIcon, ChevronDown, Download, FileText, Printer, RefreshCw, Search, Settings2, Share2, Trash2, Undo2, X } from 'lucide-react'
import { InvoiceEditDialog } from '@/components/admin/admin-invoice-edit-dialog'
import { InvoiceDummyVanPanel } from '@/components/admin/admin-invoice-dummy-van'
import { InvoicePrintSheet } from '@/components/admin/admin-invoice-print'
import { InvoiceMonthlySummary } from '@/components/admin/admin-invoice-summary'
import { useInvoiceStore } from '@/components/admin/use-invoice-store'
import { usePortal } from '@/components/portal-provider'
import {
  EmptyState,
  PageHeader,
  Segment,
  SegmentedControl,
  SoftLabel,
  Surface,
} from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
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
  DEFAULT_NATIONAL_PARK_FEE,
  NO_TRANSFER_DISCOUNT_PER_PERSON,
  agencyRatesReady,
  formatAgentBillingType,
  buildInvoiceItemsForBooking,
  documentProgram,
  formatInvoiceDate,
  formatInvoiceMoney,
  formatInvoicePayStatus,
  formatPaymentChannel,
  invoiceAmountForBooking,
  invoiceAutoAmountForBooking,
  invoiceBalance,
  invoiceGuestAmountForBooking,
  invoicePaidTotal,
  invoicePayments,
  invoiceReceiptRows,
  invoicedBookingCodes,
  isIssuedInvoice,
  isInvoiceAmountStale,
  nextDocumentNumber,
  PAYMENT_CHANNELS,
  itemsAgentTotal,
  itemsGuestTotal,
  majorityProgram,
  newCreditNoteFromInvoice,
  newInvoiceDocument,
  parseAgentBillingType,
  prebuyDeductHeads,
  prebuyNoShowMoveMoney,
  invoiceBillDate,
  ratesForAgent,
  type AgentBillingType,
  type InvoiceDocument,
  type PaymentChannel,
} from '@/lib/invoice'
import {
  buildInvoiceShareText,
  downloadInvoiceCsv,
  downloadInvoiceXlsx,
  invoiceExportFilename,
  invoicesToExportRows,
} from '@/lib/invoice-export'
import { loadPrebuyHeadBalance } from '@/lib/prebuy-allotment-sync'
import {
  bookingOnPartnerBoat,
  formatPaxBreakdown,
  isNoTransfer,
  type Booking,
  type Program,
} from '@/lib/types'
import { bookingNotesForInvoice } from '@/lib/check-in-pax-edit'
import { isGuideEnrollment } from '@/lib/check-in-enrollment'
import { addDaysISO, dateFromISO, formatShortDate, thaiParkSeatsFromGuests, todayISO, toISODate } from '@/lib/format'
import { usePortalTodayISO } from '@/lib/use-portal-today'

type Tab = 'bills' | 'dummy' | 'documents' | 'notes' | 'credits' | 'receipts' | 'summary'
type PrintMode = 'invoice' | 'billing_note' | 'receipt' | 'credit_note'
type BillSortKey = 'agent' | 'type'
type BillProgram = Program
type SortDir = 'asc' | 'desc'

function isTab(value: string | null): value is Tab {
  return (
    value === 'bills' ||
    value === 'dummy' ||
    value === 'documents' ||
    value === 'notes' ||
    value === 'credits' ||
    value === 'receipts' ||
    value === 'summary'
  )
}

function normalizeInvoiceSearch(value: string) {
  return value.trim().toLowerCase()
}

function haystackIncludes(query: string, parts: Array<string | null | undefined>) {
  if (!query) return true
  return parts.some((part) => (part ?? '').toLowerCase().includes(query))
}

function bookingMatchesInvoiceSearch(booking: Booking, query: string) {
  return haystackIncludes(query, [
    booking.code,
    booking.agentName,
    booking.agentSlug,
    booking.leadGuest,
    booking.agentRef,
    booking.pickupHotel,
    booking.note,
    booking.program,
  ])
}

function documentMatchesInvoiceSearch(
  doc: InvoiceDocument,
  query: string,
  guestByCode: Map<string, string>,
) {
  return haystackIncludes(query, [
    doc.number,
    doc.receiptNo,
    doc.agentName,
    doc.agentSlug,
    doc.notes,
    ...invoicePayments(doc).flatMap((payment) => [payment.receiptNo, payment.channel]),
    ...doc.items.flatMap((item) => [
      item.bookingCode,
      item.voucherNo,
      item.description,
      guestByCode.get(item.bookingCode),
    ]),
  ])
}

function sheetMode(doc: InvoiceDocument, tab: Tab): PrintMode {
  if (tab === 'receipts') return 'receipt'
  if (doc.kind === 'billing_note') return 'billing_note'
  if (doc.kind === 'credit_note') return 'credit_note'
  return 'invoice'
}

function formatDayMonth(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

type BillRow = {
  booking: Booking
  billingType: AgentBillingType
  billTotal: number
  deductHeads: number
  liveTotal: number
  guestCollect: number
  parkCharge: number
  extraCharge: number
  /** Invoice + No Transfer only: AD+CH × 100 discount (positive number). */
  noTransferDiscount: number
  noTransfer: boolean
  amountStale: boolean
  hasRates: boolean
  hasNoShow: boolean
  hasExtra: boolean
  sentOut: boolean
  invoice?: InvoiceDocument
}

const EXTRA_LINE_KINDS = new Set([
  'change_date',
  'private_transfer',
  'extra_zone',
  'park_fee',
  'park_guest',
  'service',
  'other',
])

const EXTRA_CHARGE_KINDS = new Set(['change_date', 'private_transfer', 'extra_zone'])

/** Saved invoice/draft total for this booking, including lines added without a booking code. */
function savedChargeForBooking(doc: InvoiceDocument, bookingCode: string) {
  const matched = doc.items.filter((item) => item.bookingCode === bookingCode)
  const uncoded = doc.items.filter((item) => !item.bookingCode)
  const codes = new Set(doc.items.map((item) => item.bookingCode).filter(Boolean))
  const lines = codes.size <= 1 && (codes.size === 0 || codes.has(bookingCode))
    ? [...matched, ...uncoded]
    : matched
  return itemsAgentTotal(lines)
}

function BillFlag({ label, title }: { label: string; title: string }) {
  return (
    <span
      className="inline-flex shrink-0 rounded px-1 py-px text-[10px] font-bold leading-none tracking-wide text-rose-600"
      title={title}
    >
      {label}
    </span>
  )
}

function BillSortHead({
  column,
  active,
  dir,
  onSort,
  children,
  className,
}: {
  column: BillSortKey
  active: boolean
  dir: SortDir
  onSort: (key: BillSortKey) => void
  children: ReactNode
  className?: string
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <TableHead className={className}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 rounded-md font-bold transition-colors hover:text-teal-900',
          active && 'text-teal-900',
        )}
        onClick={() => onSort(column)}
        aria-label={`Sort by ${column}${active ? `, currently ${dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        {children}
        <Icon className={cn('size-3.5 shrink-0', active ? 'opacity-80' : 'opacity-40')} />
      </button>
    </TableHead>
  )
}

function InvoicePayStatus({
  doc,
  today,
  onConfirm,
  onUndoLast,
  onClearAll,
  onOpenReceipt,
}: {
  doc: InvoiceDocument
  today: string
  onConfirm: (
    doc: InvoiceDocument,
    details: { paidDate: string; channel: PaymentChannel; amount: number; mode: 'full' | 'partial' },
  ) => void
  onUndoLast: (doc: InvoiceDocument) => void
  onClearAll: (doc: InvoiceDocument) => void
  onOpenReceipt: (doc: InvoiceDocument, paymentId: string) => void
}) {
  const balance = invoiceBalance(doc)
  const paidTotal = invoicePaidTotal(doc)
  const payments = invoicePayments(doc)
  const statusLabel = formatInvoicePayStatus(doc)
  const fullyPaid = balance <= 0.009 && paidTotal > 0
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [paidDate, setPaidDate] = useState(today)
  const [channel, setChannel] = useState<PaymentChannel>('deduct_deposit')
  const [amount, setAmount] = useState(String(balance || doc.grandTotal || 0))

  useEffect(() => {
    if (!open) return
    const due = invoiceBalance(doc)
    setPaidDate(today)
    setChannel(doc.paymentChannel ?? 'deduct_deposit')
    setMode(due > 0 && due < doc.grandTotal - 0.009 ? 'partial' : 'full')
    setAmount(String(due > 0 ? due : doc.grandTotal))
  }, [doc, open, today])

  const parsedAmount = Math.max(0, Math.round((Number(amount.replace(/,/g, '')) || 0) * 100) / 100)
  const payAmount = mode === 'full' ? balance : Math.min(balance, parsedAmount)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] font-semibold tracking-wide uppercase outline-none transition-colors hover:bg-teal-950/[0.04] focus-visible:ring-2 focus-visible:ring-teal-700/25',
              fullyPaid
                ? 'text-emerald-700'
                : paidTotal > 0
                  ? 'text-orange-700'
                  : 'text-amber-800',
            )}
            aria-label={`${statusLabel}. Review payment for ${doc.number}`}
          />
        }
      >
        {statusLabel}
        <ChevronDown className="size-3 opacity-45" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[22rem] gap-3 p-3">
        <div>
          <p className="text-sm font-medium text-teal-950">{doc.number}</p>
          <p className="text-xs text-teal-900/55">
            Total {formatInvoiceMoney(doc.grandTotal)} · paid {formatInvoiceMoney(paidTotal)} ·{' '}
            <span className={balance > 0.009 ? 'font-semibold text-orange-700' : 'text-emerald-700'}>
              left {formatInvoiceMoney(balance)}
            </span>
          </p>
        </div>

        {payments.length > 0 ? (
          <div className="max-h-36 space-y-1.5 overflow-y-auto rounded-lg border border-teal-900/10 bg-teal-950/[0.03] px-2 py-1.5">
            <p className="text-[10px] font-semibold tracking-wide text-teal-900/45 uppercase">
              Payment history
            </p>
            {payments.map((payment, index) => (
              <div
                key={payment.id}
                className="flex items-start justify-between gap-2 border-b border-teal-900/6 py-1.5 text-[11px] last:border-0"
              >
                <div className="min-w-0">
                  <p className="font-medium text-teal-950">
                    #{index + 1} · {formatInvoiceMoney(payment.amount)}
                  </p>
                  <p className="text-teal-900/60">
                    {formatInvoiceDate(payment.paidDate)} · {formatPaymentChannel(payment.channel)}
                  </p>
                  {payment.receiptNo ? (
                    <button
                      type="button"
                      className="mt-0.5 font-medium text-teal-700 hover:text-teal-950"
                      onClick={() => {
                        setOpen(false)
                        onOpenReceipt(doc, payment.id)
                      }}
                    >
                      Receipt {payment.receiptNo}
                    </button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {balance > 0.009 ? (
          <>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-teal-950/[0.04] p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('full')
                  setAmount(String(balance))
                }}
                className={cn(
                  'rounded-lg px-2 py-1.5 text-xs font-semibold transition-all',
                  mode === 'full'
                    ? 'bg-teal-800 text-white'
                    : 'text-teal-900/65 hover:bg-white/80',
                )}
              >
                Paid full
              </button>
              <button
                type="button"
                onClick={() => setMode('partial')}
                className={cn(
                  'rounded-lg px-2 py-1.5 text-xs font-semibold transition-all',
                  mode === 'partial'
                    ? 'bg-orange-600 text-white'
                    : 'text-teal-900/65 hover:bg-white/80',
                )}
              >
                Paid partial
              </button>
            </div>
            <div className="space-y-1.5">
              <label className="gday-soft-label" htmlFor={`paid-amount-${doc.id}`}>
                Amount (THB)
              </label>
              <Input
                id={`paid-amount-${doc.id}`}
                type="number"
                min={0}
                max={balance}
                step={1}
                inputMode="decimal"
                disabled={mode === 'full'}
                value={mode === 'full' ? String(balance) : amount}
                onChange={(event) => setAmount(event.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="gday-soft-label" htmlFor={`paid-date-${doc.id}`}>
                Date
              </label>
              <Input
                id={`paid-date-${doc.id}`}
                type="date"
                value={paidDate}
                onChange={(event) => setPaidDate(event.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <label className="gday-soft-label" htmlFor={`paid-channel-${doc.id}`}>
                Channel
              </label>
              <select
                id={`paid-channel-${doc.id}`}
                value={channel}
                onChange={(event) => setChannel(event.target.value as PaymentChannel)}
                className="h-9 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm text-teal-950 outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
              >
                {PAYMENT_CHANNELS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="button"
              className="h-9 w-full rounded-xl"
              disabled={payAmount <= 0}
              onClick={() => {
                setOpen(false)
                onConfirm(doc, {
                  paidDate,
                  channel,
                  amount: payAmount,
                  mode,
                })
              }}
            >
              {mode === 'full'
                ? `Confirm full · ${formatInvoiceMoney(payAmount)}`
                : `Confirm partial · ${formatInvoiceMoney(payAmount)}`}
            </Button>
          </>
        ) : (
          <p className="text-xs text-emerald-800">This invoice is fully paid.</p>
        )}

        {payments.length > 0 ? (
          <div className="space-y-1.5">
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full rounded-xl text-amber-800"
              onClick={() => {
                setOpen(false)
                onUndoLast(doc)
              }}
            >
              Undo last payment
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-9 w-full rounded-xl text-rose-700"
              onClick={() => {
                setOpen(false)
                onClearAll(doc)
              }}
            >
              Clear all payments
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export function AdminInvoices() {
  const {
    agents,
    bookings,
    ensureBookingsForRange,
    hydrated,
    getCheckInAttendance,
    getCheckInEnrollments,
    getDayBoatPlan,
    getDayVehiclePlan,
  } = usePortal()
  const store = useInvoiceStore()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const raw = searchParams.get('tab')
    return isTab(raw) ? raw : 'bills'
  })
  const [billSort, setBillSort] = useState<{ key: BillSortKey; dir: SortDir } | null>(null)
  const portalToday = usePortalTodayISO()
  const [fromDate, setFromDate] = useState(todayISO())
  const [toDate, setToDate] = useState(todayISO())
  const [calendarOpen, setCalendarOpen] = useState(false)

  useEffect(() => {
    if (!hydrated) return
    void ensureBookingsForRange(fromDate, toDate)
  }, [fromDate, toDate, hydrated, ensureBookingsForRange])
  const [agentSlug, setAgentSlug] = useState('all')
  const [search, setSearch] = useState('')
  const [billProgram, setBillProgram] = useState<BillProgram>('PP')
  const [includePending, setIncludePending] = useState(true)
  const [includeOtherService, setIncludeOtherService] = useState(false)
  const [hideInvoiced, setHideInvoiced] = useState(false)
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [preview, setPreview] = useState<InvoiceDocument | null>(null)
  const [previewMode, setPreviewMode] = useState<PrintMode | null>(null)
  const [previewPaymentId, setPreviewPaymentId] = useState<string | null>(null)
  const [editInvoice, setEditInvoice] = useState<InvoiceDocument | null>(null)
  const [editInvoiceIsNew, setEditInvoiceIsNew] = useState(false)
  const [shareNote, setShareNote] = useState('')
  const [message, setMessage] = useState('')
  const [prebuyBalance, setPrebuyBalance] = useState<{
    remaining: number
    purchased: number
    deducted: number
  } | null>(null)

  const invoiced = useMemo(() => invoicedBookingCodes(store.invoices), [store.invoices])
  const yesterday = addDaysISO(portalToday, -1)
  const tomorrow = addDaysISO(portalToday, 1)
  const billDays = [
    { iso: yesterday, label: 'Yesterday' },
    { iso: portalToday, label: 'Today' },
    { iso: tomorrow, label: 'Tomorrow' },
  ] as const
  const selectedBillDay = fromDate === toDate ? fromDate : null

  useEffect(() => {
    const raw = searchParams.get('tab')
    if (isTab(raw)) {
      if (raw !== tab) setTab(raw)
      return
    }
    if (tab !== 'bills') setTab('bills')
  }, [searchParams, tab])

  useEffect(() => {
    let cancelled = false
    async function loadBalance() {
      if (agentSlug === 'all') {
        setPrebuyBalance(null)
        return
      }
      const billing = parseAgentBillingType(
        ratesForAgent(store.rates, agentSlug).billingType,
      )
      if (billing !== 'prebuy') {
        setPrebuyBalance(null)
        return
      }
      const balance = await loadPrebuyHeadBalance(agentSlug, billProgram)
      if (!cancelled) {
        setPrebuyBalance(
          balance
            ? {
                remaining: balance.remaining,
                purchased: balance.purchased,
                deducted: balance.deducted,
              }
            : null,
        )
      }
    }
    void loadBalance()
    return () => {
      cancelled = true
    }
  }, [agentSlug, billProgram, store.rates, store.invoices])

  const dateLabel =
    fromDate === toDate
      ? formatShortDate(fromDate)
      : `${formatShortDate(fromDate)} – ${formatShortDate(toDate)}`

  function selectDateRange(range: { from?: Date; to?: Date } | undefined) {
    if (!range?.from) return
    const from = toISODate(range.from)
    const to = range.to ? toISODate(range.to) : from
    setFromDate(from <= to ? from : to)
    setToDate(from <= to ? to : from)
    setSelectedCodes([])
    setSelectedDocs([])
  }

  function selectBillDay(iso: string) {
    setFromDate(iso)
    setToDate(iso)
    setSelectedCodes([])
    setSelectedDocs([])
    setCalendarOpen(false)
  }

  function goTab(next: Tab) {
    setTab(next)
    setSelectedDocs([])
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'bills') params.delete('tab')
    else params.set('tab', next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function toggleBillSort(key: BillSortKey) {
    setBillSort((current) => {
      if (current?.key !== key) return { key, dir: 'asc' }
      if (current.dir === 'asc') return { key, dir: 'desc' }
      return null
    })
  }

  function bookingInvoiceItems(booking: Booking, otherService = includeOtherService) {
    const enrollments = getCheckInEnrollments(booking.date, booking.program, booking.code)
    return buildInvoiceItemsForBooking(booking, ratesForAgent(store.rates, booking.agentSlug), {
      includeOtherService: otherService,
      attendance: getCheckInAttendance(booking.date, booking.program, booking.code),
      thaiGuests: thaiParkSeatsFromGuests(booking.adults, booking.children, enrollments),
      groupGuides: enrollments.filter(isGuideEnrollment).length,
    })
  }

  const query = normalizeInvoiceSearch(search)
  const isSearching = query.length > 0

  const guestByBookingCode = useMemo(() => {
    const map = new Map<string, string>()
    for (const booking of bookings) {
      if (booking.leadGuest.trim()) map.set(booking.code, booking.leadGuest)
    }
    return map
  }, [bookings])

  const rows = useMemo<BillRow[]>(() => {
    const list = bookings
      .filter((booking) => {
        if (isSearching) return true
        const prebuy =
          parseAgentBillingType(ratesForAgent(store.rates, booking.agentSlug).billingType) ===
          'prebuy'
        const billedOn = invoiceBillDate(booking, prebuy)
        return billedOn >= fromDate && billedOn <= toDate
      })
      .filter((booking) =>
        isSearching || agentSlug === 'all' ? true : booking.agentSlug === agentSlug,
      )
      .filter((booking) => booking.program === billProgram)
      .filter((booking) => bookingMatchesInvoiceSearch(booking, query))
      .filter((booking) => {
        const attendance = getCheckInAttendance(booking.date, booking.program, booking.code)
        const prebuy =
          parseAgentBillingType(ratesForAgent(store.rates, booking.agentSlug).billingType) ===
          'prebuy'
        if (booking.status === 'Cancelled') return true
        if (prebuy && booking.noShowDateMove && booking.movedFrom?.date) return true
        if (attendance === 'checked' || attendance === 'no-show') return true
        return includePending
      })
      .map((booking) => {
        const rates = ratesForAgent(store.rates, booking.agentSlug)
        const billingType = parseAgentBillingType(rates.billingType)
        const items = bookingInvoiceItems(booking)
        const invoice = store.invoices.find(
          (doc) =>
            isIssuedInvoice(doc) &&
            doc.items.some((item) => item.bookingCode === booking.code),
        )
        const draft = store.invoices.find(
          (doc) =>
            doc.kind === 'invoice' &&
            doc.isDraft === true &&
            doc.items.some((item) => item.bookingCode === booking.code),
        )
        const priced = invoice ?? draft
        const liveTotal = itemsAgentTotal(items)
        const storedTotal = priced ? savedChargeForBooking(priced, booking.code) : liveTotal
        const liveAuto = itemsAgentTotal(items.filter((item) => item.lineKind !== 'other'))
        const billedItems = (priced?.items ?? items).filter(
          (item) => !priced || item.bookingCode === booking.code,
        )
        const extraItems = billedItems.filter((item) => EXTRA_CHARGE_KINDS.has(item.lineKind))
        const parkItems = billedItems.filter((item) => item.lineKind === 'park_fee')
        const noTransfer = isNoTransfer(booking.pickupZone)
        const noTfHeads =
          Math.max(0, booking.adults) + Math.max(0, booking.children)
        const noTransferDiscount =
          noTransfer &&
          billingType === 'invoice' &&
          booking.status !== 'Cancelled' &&
          noTfHeads > 0
            ? noTfHeads * NO_TRANSFER_DISCOUNT_PER_PERSON
            : 0
        return {
          booking,
          billingType,
          billTotal: priced ? storedTotal : liveTotal,
          deductHeads: billingType === 'prebuy' ? prebuyDeductHeads(items) : 0,
          liveTotal,
          guestCollect: priced
            ? invoiceGuestAmountForBooking(priced, booking.code)
            : itemsGuestTotal(items),
          parkCharge: parkItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
          extraCharge: extraItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0),
          noTransferDiscount,
          noTransfer,
          amountStale: Boolean(
            invoice && isInvoiceAmountStale(invoiceAutoAmountForBooking(invoice, booking.code), liveAuto),
          ),
          hasRates: agencyRatesReady(rates),
          hasNoShow: items.some((item) => item.lineKind === 'no_show'),
          hasExtra: items.some((item) => EXTRA_LINE_KINDS.has(item.lineKind)),
          sentOut: bookingOnPartnerBoat(getDayBoatPlan(booking.date, booking.program), booking.code),
          invoice,
        }
      })

    return list.sort((a, b) => {
      const issuedCmp = Number(Boolean(a.invoice)) - Number(Boolean(b.invoice))
      if (issuedCmp !== 0) return issuedCmp
      if (billSort) {
        const dir = billSort.dir === 'asc' ? 1 : -1
        if (billSort.key === 'type') {
          const byType = a.billingType.localeCompare(b.billingType)
          if (byType !== 0) return byType * dir
          return (
            a.booking.agentName.localeCompare(b.booking.agentName) ||
            a.booking.code.localeCompare(b.booking.code)
          )
        }
        const cmp = a.booking.agentName.localeCompare(b.booking.agentName)
        return cmp * dir || a.booking.code.localeCompare(b.booking.code)
      }
      return (
        a.booking.date.localeCompare(b.booking.date) ||
        a.booking.agentName.localeCompare(b.booking.agentName) ||
        a.booking.code.localeCompare(b.booking.code)
      )
    })
  }, [
    agentSlug,
    billSort,
    bookings,
    fromDate,
    getCheckInAttendance,
    getCheckInEnrollments,
    getDayBoatPlan,
    includeOtherService,
    includePending,
    isSearching,
    billProgram,
    query,
    store.invoices,
    store.rates,
    toDate,
  ])

  const bookingProgramByCode = useMemo(() => {
    const map = new Map<string, Program>()
    for (const booking of bookings) map.set(booking.code, booking.program)
    return map
  }, [bookings])

  function docInWorkProgram(doc: InvoiceDocument) {
    const program = documentProgram(doc, (code) => bookingProgramByCode.get(code))
    return program === null || program === billProgram
  }

  const documents = useMemo(() => {
    return store.invoices
      .filter((doc) => !doc.isDraft)
      .filter((doc) => docInWorkProgram(doc))
      .filter((doc) =>
        isSearching || agentSlug === 'all' ? true : doc.agentSlug === agentSlug,
      )
      .filter((doc) => {
        if (isSearching) return documentMatchesInvoiceSearch(doc, query, guestByBookingCode)
        // Show docs issued, paid, or with travel in the selected range (not travel-only —
        // staff often bill older trips on a later day).
        if (doc.issueDate >= fromDate && doc.issueDate <= toDate) return true
        if (
          doc.items.some((item) => {
            const date = item.travelDate
            return Boolean(date) && date >= fromDate && date <= toDate
          })
        ) {
          return true
        }
        return invoicePayments(doc).some(
          (payment) => payment.paidDate >= fromDate && payment.paidDate <= toDate,
        )
      })
  }, [agentSlug, billProgram, bookingProgramByCode, fromDate, guestByBookingCode, isSearching, query, store.invoices, toDate])

  const invoices = useMemo(
    () => documents.filter((doc) => doc.kind === 'invoice'),
    [documents],
  )
  const billingNotes = useMemo(
    () => documents.filter((doc) => doc.kind === 'billing_note'),
    [documents],
  )
  const creditNotes = useMemo(
    () => documents.filter((doc) => doc.kind === 'credit_note'),
    [documents],
  )
  const receipts = useMemo(() => {
    // Receipts: prefer payment date in range; fall back to already date-matched invoices.
    const pool = store.invoices.filter(
      (doc) =>
        isIssuedInvoice(doc) &&
        docInWorkProgram(doc) &&
        (isSearching || agentSlug === 'all' || doc.agentSlug === agentSlug),
    )
    const rows = invoiceReceiptRows(pool).filter(({ doc, payment }) => {
      if (isSearching) return documentMatchesInvoiceSearch(doc, query, guestByBookingCode)
      if (payment.paidDate >= fromDate && payment.paidDate <= toDate) return true
      if (doc.issueDate >= fromDate && doc.issueDate <= toDate) return true
      return doc.items.some((item) => {
        const date = item.travelDate
        return Boolean(date) && date >= fromDate && date <= toDate
      })
    })
    return rows.sort(
      (a, b) =>
        b.payment.paidDate.localeCompare(a.payment.paidDate) ||
        b.payment.receiptNo.localeCompare(a.payment.receiptNo),
    )
  }, [
    agentSlug,
    fromDate,
    guestByBookingCode,
    isSearching,
    query,
    billProgram,
    bookingProgramByCode,
    store.invoices,
    toDate,
  ])
  const listedDocs =
    tab === 'notes' ? billingNotes : tab === 'credits' ? creditNotes : invoices

  const openRows = useMemo(() => rows.filter((row) => !row.invoice), [rows])
  const visibleBillRows = useMemo(
    () => (hideInvoiced ? openRows : rows),
    [hideInvoiced, openRows, rows],
  )
  const allOpenSelected =
    openRows.length > 0 && openRows.every((row) => selectedCodes.includes(row.booking.code))

  const selectedBookings = rows
    .filter((row) => selectedCodes.includes(row.booking.code) && !row.invoice)
    .map((row) => row.booking)

  useEffect(() => {
    setSelectedCodes((current) => {
      const next = current.filter((code) => !invoiced.has(code))
      return next.length === current.length ? current : next
    })
  }, [invoiced])

  const selectedDocuments = store.invoices.filter((doc) => selectedDocs.includes(doc.id))

  const selectedRows = rows.filter((row) => selectedCodes.includes(row.booking.code))
  const selectedGuestTotal = selectedRows.reduce((sum, row) => sum + row.billTotal, 0)
  const selectedHeads = selectedRows.reduce((sum, row) => sum + row.deductHeads, 0)
  const pageGuestTotal = rows.reduce((sum, row) => sum + row.billTotal, 0)
  const pageHeads = rows.reduce((sum, row) => sum + row.deductHeads, 0)

  function toggleCode(code: string, locked = false) {
    setSelectedCodes((current) => {
      if (current.includes(code)) return current.filter((item) => item !== code)
      if (locked || invoiced.has(code)) return current
      return [...current, code]
    })
  }

  function toggleDoc(id: string) {
    setSelectedDocs((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function toggleAllBills() {
    if (allOpenSelected) setSelectedCodes([])
    else setSelectedCodes(openRows.map((row) => row.booking.code))
  }

  function toggleAllDocs() {
    if (listedDocs.length > 0 && selectedDocs.length === listedDocs.length) setSelectedDocs([])
    else setSelectedDocs(listedDocs.map((doc) => doc.id))
  }

  function groupedByAgent(list: Booking[]) {
    const map = new Map<string, Booking[]>()
    for (const booking of list) {
      const current = map.get(booking.agentSlug) ?? []
      current.push(booking)
      map.set(booking.agentSlug, current)
    }
    return map
  }

  const multiDay = fromDate !== toDate
  const agentFilterName =
    agentSlug === 'all'
      ? null
      : agents.find((agent) => agent.slug === agentSlug)?.name ??
        bookings.find((booking) => booking.agentSlug === agentSlug)?.agentName ??
        agentSlug
  const billTargets =
    selectedBookings.length > 0
      ? selectedBookings
      : agentSlug !== 'all'
        ? openRows.map((row) => row.booking)
        : []
  const billTargetAgents = new Set(billTargets.map((booking) => booking.agentSlug))
  const oneInvoiceReady = billTargets.length > 0 && billTargetAgents.size === 1

  async function createFromBookings(markPaidAfter = false) {
    const toBill = billTargets
    if (toBill.length === 0) {
      setMessage(
        agentSlug === 'all'
          ? 'Choose an agent (or select bookings), then Make invoice — one agent across many days becomes one invoice.'
          : 'No open bookings to invoice for this agent in the selected dates.',
      )
      return
    }
    const missing = [...new Set(toBill.map((booking) => booking.agentSlug))].filter(
      (slug) => !agencyRatesReady(ratesForAgent(store.rates, slug)),
    )
    if (missing.length > 0) {
      const names = missing
        .map((slug) => agents.find((agent) => agent.slug === slug)?.name ?? slug)
        .join(', ')
      setMessage(`Set agency prices first for ${names}.`)
      return
    }

    const created: InvoiceDocument[] = []
    let existing = store.invoices
    for (const [slug, agentBookings] of groupedByAgent(toBill)) {
      const items = agentBookings.flatMap((booking) => bookingInvoiceItems(booking))
      if (items.length === 0) continue
      const doc = newInvoiceDocument({
        existing,
        kind: 'invoice',
        agentSlug: slug,
        agentName: agentBookings[0]!.agentName,
        issueDate: todayISO(),
        notes: bookingNotesForInvoice(agentBookings),
        items,
        program: majorityProgram(agentBookings),
      })
      created.push(doc)
      existing = [doc, ...existing]
    }
    if (created.length === 0) {
      setMessage('No billable lines for the selected bookings.')
      return
    }
    await store.addDocuments(created)
    if (markPaidAfter) {
      await store.markPaid(
        created.map((doc) => doc.id),
        created,
      )
    }
    setSelectedCodes([])
    const first = created[0] ?? null
    if (first) {
      openPreview(first, markPaidAfter ? 'receipt' : 'invoice')
    }
    if (markPaidAfter) {
      goTab('receipts')
    }
    const bookingCount = toBill.length
    setMessage(
      markPaidAfter
        ? `Created invoice(s) and issued ${created.length} receipt(s).`
        : created.length === 1
          ? `Created 1 invoice · ${bookingCount} booking${bookingCount === 1 ? '' : 's'} · ${dateLabel}.`
          : `Created ${created.length} invoices (one per agent) · ${bookingCount} bookings.`,
    )
    return created
  }

  async function createBillingNoteFromInvoices() {
    const source = selectedDocuments.filter((doc) => doc.kind === 'invoice')
    if (source.length < 2) {
      setMessage('Select at least two invoices to create a billing note.')
      return
    }
    const byAgent = new Map<string, InvoiceDocument[]>()
    for (const doc of source) {
      const list = byAgent.get(doc.agentSlug) ?? []
      list.push(doc)
      byAgent.set(doc.agentSlug, list)
    }
    const created: InvoiceDocument[] = []
    let existing = store.invoices
    for (const [slug, docs] of byAgent) {
      if (docs.length < 2) continue
      const items = docs.flatMap((doc) => doc.items)
      const note = newInvoiceDocument({
        existing,
        kind: 'billing_note',
        agentSlug: slug,
        agentName: docs[0]!.agentName,
        issueDate: todayISO(),
        items,
        linkedInvoiceIds: docs.map((doc) => doc.id),
        notes: docs.map((doc) => doc.number).join(', '),
      })
      created.push(note)
      existing = [note, ...existing]
    }
    if (created.length === 0) {
      setMessage('Select at least two invoices from the same agent.')
      return
    }
    await store.addDocuments(created)
    setSelectedDocs([])
    setPreview(created[0] ?? null)
    goTab('notes')
    setMessage(`Created ${created.length} billing note(s).`)
  }

  async function createCreditNotesFromInvoices() {
    const source = selectedDocuments.filter((doc) => doc.kind === 'invoice')
    if (source.length === 0) {
      setMessage('Select one or more invoices to create credit notes.')
      return
    }
    const created: InvoiceDocument[] = []
    let existing = store.invoices
    for (const invoice of source) {
      const note = newCreditNoteFromInvoice(invoice, existing, todayISO())
      created.push(note)
      existing = [note, ...existing]
    }
    await store.addDocuments(created)
    setSelectedDocs([])
    setPreview(created[0] ?? null)
    setPreviewMode('credit_note')
    goTab('credits')
    setMessage(`Created ${created.length} credit note(s).`)
  }

  async function toggleSendToAgent(doc: InvoiceDocument) {
    const nextSend = !doc.sendToAgent
    const next = { ...doc, sendToAgent: nextSend }
    await store.replaceDocument(next)
    if (preview?.id === doc.id) setPreview(next)
    if (nextSend) {
      const text = buildInvoiceShareText(next)
      try {
        await navigator.clipboard.writeText(text)
        setShareNote(`Marked send · copied ${next.number} summary`)
        openPreview(next, next.kind === 'billing_note' ? 'billing_note' : next.kind === 'credit_note' ? 'credit_note' : 'invoice')
      } catch {
        setShareNote(`Marked send for ${next.number} — copy failed, use Share/Print`)
      }
      window.setTimeout(() => setShareNote(''), 2500)
    }
  }

  async function exportDocuments(ext: 'csv' | 'xlsx') {
    const pool =
      tab === 'notes'
        ? billingNotes
        : tab === 'credits'
          ? creditNotes
          : invoices
    if (pool.length === 0) {
      setMessage('Nothing to export in this view.')
      return
    }
    const rows = invoicesToExportRows(pool, store.rates)
    const filename = invoiceExportFilename(fromDate, toDate, ext)
    if (ext === 'csv') downloadInvoiceCsv(rows, filename)
    else await downloadInvoiceXlsx(rows, filename)
    setMessage(`Exported ${pool.length} row(s) · ${filename}`)
  }

  async function confirmPayment(
    doc: InvoiceDocument,
    details: {
      paidDate: string
      channel: PaymentChannel
      amount: number
      mode: 'full' | 'partial'
    },
  ) {
    if (doc.kind !== 'invoice') return
    const paidDate = details.paidDate || todayISO()
    const updated = await store.markPaid([doc.id], [], {
      paidDate,
      channel: details.channel,
      amount: details.amount,
    })
    const next = updated[0]
    setSelectedDocs([])
    if (next) {
      if (preview?.id === doc.id) setPreview(next)
      const latest = invoicePayments(next).at(-1)
      if (latest?.receiptNo) {
        openPreview(next, 'receipt', latest.id)
      }
    }
    const left = next ? invoiceBalance(next) : 0
    const latestReceipt = next ? invoicePayments(next).at(-1)?.receiptNo : null
    setMessage(
      next?.status === 'paid'
        ? `Fully paid · receipt ${latestReceipt ?? 'issued'} from ${doc.number}.`
        : `Partial payment ${formatInvoiceMoney(details.amount)} · receipt ${latestReceipt ?? 'issued'}. Balance left ${formatInvoiceMoney(left)}.`,
    )
  }

  async function undoLastPayment(doc: InvoiceDocument) {
    const next = await store.removeLastPayment(doc.id)
    if (!next) return
    if (preview?.id === doc.id) setPreview(next)
    setMessage(
      next.status === 'unpaid'
        ? `${doc.number} is unpaid again.`
        : `Removed last payment on ${doc.number}. Balance left ${formatInvoiceMoney(invoiceBalance(next))}.`,
    )
  }

  async function clearAllPayments(doc: InvoiceDocument) {
    const next = await store.clearPayments(doc.id)
    if (!next) return
    if (preview?.id === doc.id) setPreview(next)
    setMessage(`${doc.number} is unpaid again.`)
  }

  function currentPreviewMode(doc: InvoiceDocument) {
    return previewMode ?? sheetMode(doc, tab)
  }

  function openPreview(doc: InvoiceDocument, mode?: PrintMode, paymentId?: string | null) {
    setPreviewMode(mode ?? sheetMode(doc, tab))
    setPreviewPaymentId(paymentId ?? null)
    setPreview(doc)
  }

  function closePreview() {
    setPreview(null)
    setPreviewMode(null)
    setPreviewPaymentId(null)
  }

  function printDoc(doc: InvoiceDocument, mode?: PrintMode, paymentId?: string | null) {
    openPreview(doc, mode, paymentId)
    window.setTimeout(() => window.print(), 250)
  }

  function previewTitle(doc: InvoiceDocument) {
    const mode = currentPreviewMode(doc)
    if (mode === 'receipt') {
      const payment = previewPaymentId
        ? invoicePayments(doc).find((row) => row.id === previewPaymentId)
        : invoicePayments(doc).at(-1)
      return `Receipt · ${payment?.receiptNo ?? doc.receiptNo ?? doc.number}`
    }
    if (mode === 'billing_note') return `Billing note · ${doc.number}`
    if (mode === 'credit_note' || doc.kind === 'credit_note') return `Credit note · ${doc.number}`
    return `Invoice · ${doc.number}`
  }

  async function shareDoc(doc: InvoiceDocument) {
    const title = previewTitle(doc)
    const text = buildInvoiceShareText(doc)
    try {
      if (navigator.share) {
        await navigator.share({ title, text })
        return
      }
      await navigator.clipboard.writeText(text)
      setShareNote('Copied bill details')
      window.setTimeout(() => setShareNote(''), 1800)
    } catch {
      window.prompt('Copy this bill', text)
    }
  }

  function openBill(row: BillRow) {
    if (row.invoice) {
      setEditInvoiceIsNew(false)
      setEditInvoice(row.invoice)
      return
    }
    const draft = store.invoices.find(
      (doc) =>
        doc.kind === 'invoice' &&
        doc.isDraft === true &&
        doc.items.some((item) => item.bookingCode === row.booking.code),
    )
    if (draft) {
      setEditInvoiceIsNew(false)
      setEditInvoice(draft)
      return
    }
    if (!row.hasRates) {
      setMessage(`Set agency prices first for ${row.booking.agentName}.`)
      return
    }
    const items = bookingInvoiceItems(row.booking)
    if (items.length === 0) {
      setMessage('No billable lines for this booking.')
      return
    }
    setEditInvoiceIsNew(true)
    setEditInvoice(
      newInvoiceDocument({
        existing: store.invoices,
        kind: 'invoice',
        agentSlug: row.booking.agentSlug,
        agentName: row.booking.agentName,
        issueDate: todayISO(),
        notes: bookingNotesForInvoice([row.booking]),
        items,
        program: row.booking.program,
      }),
    )
  }

  async function saveEditedInvoice(doc: InvoiceDocument, mode: 'draft' | 'issue' = 'issue') {
    const wasNew = editInvoiceIsNew
    const alreadyStored = store.invoices.some((row) => row.id === doc.id)
    if (mode === 'draft') {
      const draft: InvoiceDocument = {
        ...doc,
        isDraft: true,
        number: doc.number.startsWith('DRAFT-')
          ? doc.number
          : `DRAFT-${doc.id.replace(/-/g, '').slice(0, 10)}`,
      }
      if (alreadyStored) await store.replaceDocument(draft)
      else await store.addDocuments([draft])
      setMessage('Saved. Invoice not issued yet.')
      setEditInvoice(null)
      setEditInvoiceIsNew(false)
      return
    }

    let issued = { ...doc, isDraft: false }
    if (doc.isDraft || !issued.number.startsWith('INV')) {
      issued = {
        ...issued,
        number: nextDocumentNumber(
          store.invoices.filter((row) => !row.isDraft),
          'invoice',
          issued.issueDate,
        ),
      }
    }
    if (wasNew && !alreadyStored) {
      await store.addDocuments([issued])
      setMessage(`Created invoice ${issued.number}.`)
    } else {
      await store.replaceDocument(issued)
      setMessage(doc.isDraft ? `Created invoice ${issued.number}.` : `Updated ${issued.number}.`)
    }
    setEditInvoice(null)
    setEditInvoiceIsNew(false)
    if (wasNew || doc.isDraft) {
      // Wait for the edit dialog to close before opening the PDF view.
      window.setTimeout(() => openPreview(issued, 'invoice'), 120)
    } else if (preview?.id === issued.id) {
      setPreview(issued)
    }
  }

  async function deleteSelectedDocs() {
    if (selectedDocs.length === 0) {
      setMessage('Select invoices to delete.')
      return
    }
    const docs = store.invoices.filter((doc) => selectedDocs.includes(doc.id))
    const paidCount = docs.filter(
      (doc) => doc.status === 'paid' || doc.status === 'partial' || invoicePaidTotal(doc) > 0,
    ).length
    if (paidCount > 0) {
      setMessage(`${paidCount} paid/partial invoice(s) cannot be deleted. Clear payments first.`)
      return
    }
    const label =
      tab === 'notes' ? 'billing note' : tab === 'credits' ? 'credit note' : 'invoice'
    const ok = window.confirm(`Delete ${docs.length} ${label}(s)? This cannot be undone.`)
    if (!ok) return
    for (const doc of docs) {
      await store.removeDocument(doc.id)
    }
    setSelectedDocs([])
    setPreview(null)
    setMessage(`Deleted ${docs.length} ${label}(s).`)
  }

  async function undoPaidSelected() {
    if (selectedDocs.length === 0) {
      setMessage('Select paid or partial invoices to clear payments.')
      return
    }
    const docs = store.invoices.filter(
      (doc) =>
        selectedDocs.includes(doc.id) &&
        (doc.status === 'paid' || doc.status === 'partial' || invoicePaidTotal(doc) > 0),
    )
    if (docs.length === 0) {
      setMessage('No paid/partial invoices selected.')
      return
    }
    const ok = window.confirm(
      `Clear all payments on ${docs.length} invoice(s)? Receipt numbers will be removed.`,
    )
    if (!ok) return
    for (const doc of docs) {
      await store.clearPayments(doc.id)
    }
    setSelectedDocs([])
    setMessage(`Cleared payments on ${docs.length} invoice(s).`)
  }

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const agent of agents) map.set(agent.slug, agent.name)
    for (const booking of bookings) {
      if (!map.has(booking.agentSlug)) map.set(booking.agentSlug, booking.agentName)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [agents, bookings])

  return (
    <div className="w-full">
      <div className="print:hidden">
      <PageHeader
        title="Invoice / Receipt"
        description="Phi Phi and James Bond are separate. Both use the same company and the same Prebuy or Invoice rules."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl gap-1.5"
              onClick={() => void store.reload()}
              disabled={store.loading}
            >
              <RefreshCw className={cn('size-3.5', store.loading && 'animate-spin')} />
              Refresh
            </Button>
            <Link href={pathname.startsWith('/accounting') ? '/accounting/setup' : '/admin/invoices/setup'}>
              <Button type="button" variant="outline" className="h-10 rounded-xl">
                <Settings2 className="size-3.5" />
                Setup
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl>
          <Segment
            active={billProgram === 'PP'}
            onClick={() => {
              setBillProgram('PP')
              setSelectedCodes([])
              setSelectedDocs([])
            }}
          >
            Phi Phi
          </Segment>
          <Segment
            active={billProgram === 'James Bond'}
            onClick={() => {
              setBillProgram('James Bond')
              setSelectedCodes([])
              setSelectedDocs([])
            }}
          >
            James Bond
          </Segment>
        </SegmentedControl>
        <p className="text-sm text-teal-900/60">
          <span className="font-semibold text-teal-950">{store.settings.companyName}</span>
          {' · '}
          {billProgram === 'PP' ? 'Phi Phi' : 'James Bond'} bills and invoices
        </p>
      </div>

      {!store.cloud && !store.loading ? (
        <p className="mb-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          Invoice cloud sync is off on this browser (local copy only). Sign in again with the staff
          PIN, or open Setup — otherwise invoices from other computers will not appear here.
        </p>
      ) : null}
      <Surface className="mb-3 px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-center gap-2">
          <SoftLabel className="mr-0.5">Date</SoftLabel>
          <SegmentedControl className="rounded-xl p-0.5">
            {billDays.map((day) => (
              <Segment
                key={day.iso}
                active={selectedBillDay === day.iso}
                onClick={() => selectBillDay(day.iso)}
                className="rounded-lg px-2.5 py-1 text-xs"
              >
                {day.label}
                <span className="ml-1 font-normal opacity-75">{formatDayMonth(day.iso)}</span>
              </Segment>
            ))}
          </SegmentedControl>
          <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="outline"
                  className={cn(
                    'h-8 min-w-[11rem] justify-start gap-1.5 rounded-lg px-2.5 text-xs font-normal',
                    multiDay && 'border-teal-700/35 bg-teal-50/80',
                  )}
                />
              }
            >
              <CalendarIcon className="size-3.5 text-teal-700/60" />
              {dateLabel}
              {multiDay ? (
                <span className="rounded-md bg-teal-800/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-900">
                  Multi
                </span>
              ) : null}
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="!w-fit max-w-none overflow-visible p-3"
            >
              <Calendar
                mode="range"
                selected={{ from: dateFromISO(fromDate), to: dateFromISO(toDate) }}
                onSelect={selectDateRange}
                defaultMonth={dateFromISO(fromDate)}
                numberOfMonths={1}
                className="w-full [--cell-size:2.35rem]"
              />
              <p className="px-2 pb-1 text-xs text-teal-900/45">
                One day, or click a second day for a range — then pick one agent to make 1 invoice.
              </p>
            </PopoverContent>
          </Popover>
          <SoftLabel className="ml-1 mr-0.5">Agent</SoftLabel>
          <select
            id="invoice-agent"
            aria-label="Agent"
            value={agentSlug}
            onChange={(event) => {
              setAgentSlug(event.target.value)
              setSelectedCodes([])
              setSelectedDocs([])
            }}
            className={cn(
              'h-8 min-w-[12rem] rounded-lg border bg-white/80 px-2 text-xs text-teal-950 outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15',
              agentSlug !== 'all'
                ? 'border-teal-700/35 bg-teal-50/80 font-medium'
                : 'border-teal-900/12',
            )}
          >
            <option value="all">All agents</option>
            {agentOptions.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
          <div className="relative min-w-[14rem] flex-1 sm:max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-teal-900/35" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setSelectedCodes([])
                setSelectedDocs([])
              }}
              placeholder="Search INV No., Receipt No., agent, or guest…"
              className="h-8 rounded-lg pr-8 pl-8 text-xs"
              aria-label="Search by invoice number, receipt number, agent, or guest"
            />
            {isSearching ? (
              <button
                type="button"
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded-md p-1 text-teal-900/40 hover:bg-teal-950/5 hover:text-teal-950"
                aria-label="Clear search"
                onClick={() => {
                  setSearch('')
                  setSelectedCodes([])
                  setSelectedDocs([])
                }}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
        {isSearching ? (
          <p className="mt-2 text-xs text-teal-900/60">
            Searching all dates for{' '}
            <span className="font-semibold text-teal-950">&ldquo;{search.trim()}&rdquo;</span>
            {' · '}
            INV No., Receipt No., agent, or guest
          </p>
        ) : agentFilterName ? (
          <p className="mt-2 text-xs text-teal-900/60">
            Showing <span className="font-semibold text-teal-950">{agentFilterName}</span>
            {multiDay ? ` · ${dateLabel}` : ` · ${dateLabel}`}
            {' · '}
            {openRows.length} open booking{openRows.length === 1 ? '' : 's'} ready for{' '}
            <span className="font-semibold text-teal-950">1 invoice</span>
            {selectedCodes.length === 0 && openRows.length > 0
              ? ' (Make invoice uses all open rows)'
              : ''}
            .
          </p>
        ) : multiDay ? (
          <p className="mt-2 text-xs text-teal-900/55">
            Multi-day range selected. Choose one agent to bill all their bookings in a single invoice.
          </p>
        ) : null}
      </Surface>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <SegmentedControl>
          <Segment active={tab === 'bills'} onClick={() => goTab('bills')}>
            Bills
          </Segment>
          <Segment active={tab === 'documents'} onClick={() => goTab('documents')}>
            Invoices
          </Segment>
          <Segment active={tab === 'notes'} onClick={() => goTab('notes')}>
            Billing notes
          </Segment>
          <Segment active={tab === 'credits'} onClick={() => goTab('credits')}>
            Credit notes
          </Segment>
          <Segment active={tab === 'receipts'} onClick={() => goTab('receipts')}>
            Receipts
          </Segment>
          <Segment active={tab === 'summary'} onClick={() => goTab('summary')}>
            Summary
          </Segment>
        </SegmentedControl>
        <SegmentedControl className="border-violet-900/12 bg-gradient-to-r from-violet-950/[0.06] via-fuchsia-950/[0.04] to-neutral-950/[0.03]">
          <Segment
            active={tab === 'dummy'}
            onClick={() => goTab('dummy')}
            className={
              tab === 'dummy'
                ? 'from-violet-700 to-fuchsia-700 shadow-violet-700/20'
                : 'text-violet-900/55 hover:bg-white/70 hover:text-violet-950'
            }
          >
            Tour Partner Inv.
          </Segment>
        </SegmentedControl>
      </div>

      {store.error ? (
        <p className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
          ⚠ {store.error}
          <button
            type="button"
            className="ml-2 font-medium underline"
            onClick={store.clearError}
          >
            Dismiss
          </button>
        </p>
      ) : null}

      {message ? (
        <p className="mb-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
          {message}
        </p>
      ) : null}

      {tab === 'dummy' ? (
        <InvoiceDummyVanPanel
          bookings={bookings.filter((booking) => booking.program === billProgram)}
          fromDate={fromDate}
          toDate={toDate}
          agentSlug={agentSlug}
          getDayVehiclePlan={getDayVehiclePlan}
          getDayBoatPlan={getDayBoatPlan}
          getCheckInAttendance={getCheckInAttendance}
          agentInvoiceNo={(code) =>
            store.invoices.find(
              (doc) =>
                isIssuedInvoice(doc) &&
                docInWorkProgram(doc) &&
                doc.items.some((item) => item.bookingCode === code),
            )?.number ?? ''
          }
        />
      ) : tab === 'bills' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs text-teal-900/65">
                <input
                  type="checkbox"
                  checked={includePending}
                  onChange={(event) => setIncludePending(event.target.checked)}
                  className="size-3.5 rounded border-teal-900/20"
                />
                Include pending
              </label>
              <label className="flex items-center gap-1.5 text-xs text-teal-900/65">
                <input
                  type="checkbox"
                  checked={includeOtherService}
                  onChange={(event) => setIncludeOtherService(event.target.checked)}
                  className="size-3.5 rounded border-teal-900/20"
                />
                Other service
              </label>
              <label className="flex items-center gap-1.5 text-xs text-teal-900/65">
                <input
                  type="checkbox"
                  checked={hideInvoiced}
                  onChange={(event) => setHideInvoiced(event.target.checked)}
                  className="size-3.5 rounded border-teal-900/20"
                />
                Hide invoiced
              </label>
              <p className="text-sm text-teal-900/55">
                {visibleBillRows.length} booking{visibleBillRows.length === 1 ? '' : 's'}
                {hideInvoiced ? '' : ` · ${openRows.length} open`}
                {selectedCodes.length > 0
                  ? ` · ${selectedCodes.length} selected · ${formatInvoiceMoney(selectedGuestTotal)} THB`
                  : ''}
              </p>
              {prebuyBalance ? (
                <p
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-[11px] font-medium',
                    prebuyBalance.remaining < 0
                      ? 'bg-rose-50 text-rose-800'
                      : 'bg-amber-50 text-amber-900',
                  )}
                  title={`Purchased ${prebuyBalance.purchased} · Deducted ${prebuyBalance.deducted}`}
                >
                  Prebuy heads left: {prebuyBalance.remaining}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-10 rounded-xl"
                disabled={billTargets.length === 0}
                title={
                  agentSlug === 'all' && selectedCodes.length === 0
                    ? 'Choose an agent or select bookings first'
                    : oneInvoiceReady
                      ? `Create 1 invoice for ${billTargets.length} booking(s)`
                      : 'Creates one invoice per agent'
                }
                onClick={() => void createFromBookings()}
              >
                <FileText className="size-3.5" />
                {oneInvoiceReady
                  ? `Make 1 invoice${agentFilterName ? ` · ${agentFilterName}` : ''}`
                  : selectedCodes.length > 0
                    ? `Make invoices (${billTargetAgents.size})`
                    : 'Make invoice'}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                disabled={billTargets.length === 0}
                title="Create invoice(s) and mark paid with Deduct Deposit receipt"
                onClick={() => void createFromBookings(true)}
              >
                Invoice + receipt
              </Button>
            </div>
          </div>
          <Surface className="overflow-hidden">
            {rows.length === 0 ? (
              <EmptyState>
                No check-in bookings for{' '}
                {fromDate === toDate
                  ? formatShortDate(fromDate)
                  : `${formatShortDate(fromDate)} – ${formatShortDate(toDate)}`}
                .
              </EmptyState>
            ) : visibleBillRows.length === 0 ? (
              <EmptyState>
                All bookings in this range are already invoiced. Turn off “Hide invoiced” to see them,
                or pick another date / agent.
              </EmptyState>
            ) : (
              <div>
                <div className="flex flex-wrap items-center gap-3 border-b border-teal-900/8 px-3 py-2 text-[11px] text-teal-900/55">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-amber-200 ring-1 ring-amber-300" />
                    Open — can select for a new invoice
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="size-2.5 rounded-sm bg-neutral-200 ring-1 ring-neutral-300" />
                    Gray — already invoiced (checkbox locked)
                  </span>
                </div>
                <Table className="table-fixed text-xs" containerClassName="overflow-x-hidden">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8 px-1.5">
                        <input
                          type="checkbox"
                          checked={allOpenSelected}
                          disabled={openRows.length === 0}
                          onChange={toggleAllBills}
                          className="size-4 rounded border-teal-900/20 disabled:cursor-not-allowed disabled:opacity-40"
                          title={
                            openRows.length === 0
                              ? 'All bookings in this range already have an invoice'
                              : `Select all ${openRows.length} open booking(s) across the date range`
                          }
                        />
                      </TableHead>
                      <TableHead className="w-[3.25rem] px-1 font-bold">Date</TableHead>
                      <TableHead className="w-[4.75rem] px-1 font-bold" title="Voucher number">
                        VC No
                      </TableHead>
                      <BillSortHead
                        column="agent"
                        active={billSort?.key === 'agent'}
                        dir={billSort?.dir ?? 'asc'}
                        onSort={toggleBillSort}
                        className="w-[6.5rem] px-1 font-bold"
                      >
                        Agent
                      </BillSortHead>
                      <BillSortHead
                        column="type"
                        active={billSort?.key === 'type'}
                        dir={billSort?.dir ?? 'asc'}
                        onSort={toggleBillSort}
                        className="w-14 pl-0.5 pr-1 font-bold"
                      >
                        Type
                      </BillSortHead>
                      <TableHead className="w-[7.5rem] px-1.5 font-bold">Guest</TableHead>
                      <TableHead className="w-[7rem] px-1.5 font-bold">Pax</TableHead>
                      <TableHead className="w-[7rem] px-1 font-bold">Hotel</TableHead>
                      <TableHead
                        className="w-[4.25rem] px-1 font-bold"
                        title="Included = INC · Excluded shows Exc + agency park fee"
                      >
                        Park Fee
                      </TableHead>
                      <TableHead
                        className="w-[4.75rem] px-1.5 text-right font-bold"
                        title="No Transfer: −100 THB per AD+CH for Invoice agents only. Transfer bookings stay blank."
                      >
                        TF /
                        <br />
                        No TF
                      </TableHead>
                      <TableHead className="w-[4.75rem] px-1.5 text-right font-bold">Extra</TableHead>
                      <TableHead className="w-[6.5rem] px-1.5 font-bold">Note</TableHead>
                      <TableHead className="w-12 px-1.5 text-right font-bold">Deduct</TableHead>
                      <TableHead className="w-[5rem] px-1.5 text-right font-bold">Charge</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleBillRows.map((row) => {
                      const { booking } = row
                      const issued = Boolean(row.invoice)
                      return (
                        <TableRow
                          key={booking.code}
                          className={cn(
                            'cursor-pointer',
                            issued
                              ? 'bg-neutral-50 text-neutral-400 hover:bg-neutral-100'
                              : 'bg-amber-50/70 text-teal-950 hover:bg-amber-100/80',
                          )}
                          title={
                            issued
                              ? `Already invoiced as ${row.invoice?.number} — cannot select again`
                              : 'Open — select to include on a new invoice'
                          }
                          onClick={() => openBill(row)}
                        >
                          <TableCell
                            className="px-1.5"
                            onClick={(event) => event.stopPropagation()}
                          >
                            {issued ? (
                              <span
                                className="inline-flex size-4 items-center justify-center text-[9px] font-bold text-neutral-400"
                                title={`Already invoiced as ${row.invoice?.number}`}
                              >
                                ✓
                              </span>
                            ) : (
                              <input
                                type="checkbox"
                                checked={selectedCodes.includes(booking.code)}
                                onChange={() => toggleCode(booking.code, false)}
                                className="size-4 rounded border-teal-900/20"
                                title="Select for invoice"
                              />
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'whitespace-nowrap px-1 tabular-nums',
                              issued ? 'text-neutral-400' : 'text-teal-900/75',
                            )}
                            title={
                              row.billingType === 'prebuy' && booking.noShowDateMove && booking.movedFrom?.date
                                ? (booking.lateChangeFee ?? 0) > 0
                                  ? `New date bill. Heads deducted on ${formatShortDate(booking.movedFrom.date)}`
                                  : `After 10 PM — still charged on ${formatShortDate(booking.movedFrom.date)}`
                                : formatShortDate(booking.date)
                            }
                          >
                            {formatDayMonth(invoiceBillDate(booking, row.billingType === 'prebuy'))}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'truncate px-1 font-medium',
                              issued ? 'text-neutral-400' : 'text-teal-950',
                            )}
                            title={booking.agentRef?.trim() || undefined}
                          >
                            {booking.agentRef?.trim() || '—'}
                          </TableCell>
                          <TableCell className="max-w-[6.5rem] truncate px-1" title={booking.agentName}>
                            {booking.agentName}
                          </TableCell>
                          <TableCell
                            className="w-14 truncate pl-0.5 pr-1 text-left text-[11px]"
                            title={
                              row.billingType === 'prebuy'
                                ? 'Prebuy — deduct AD+CH heads, bill extras only'
                                : 'Invoice — bill the tour price plus extras'
                            }
                          >
                            {formatAgentBillingType(row.billingType)}
                          </TableCell>
                          <TableCell className="w-[7.5rem] max-w-[7.5rem] px-1.5" title={booking.leadGuest}>
                            <span className="inline-flex min-w-0 max-w-full items-center gap-1">
                              <span className="truncate">{booking.leadGuest}</span>
                              {row.hasNoShow ? (
                                <BillFlag label="NS" title="This booking has a no-show guest" />
                              ) : null}
                              {row.sentOut ? (
                                <BillFlag label="Sent" title="Sent to another company on a partner boat" />
                              ) : null}
                            </span>
                          </TableCell>
                          <TableCell className="truncate px-1.5 tabular-nums" title={formatPaxBreakdown(booking)}>{formatPaxBreakdown(booking)}</TableCell>
                          <TableCell
                            className="max-w-[7rem] truncate px-1"
                            title={booking.pickupHotel.trim() || undefined}
                          >
                            {booking.pickupHotel.trim() || '—'}
                          </TableCell>
                          <TableCell
                            className="w-[4.25rem] px-1 text-[11px] tabular-nums"
                            title={
                              booking.parkFee === 'Included' ||
                              ratesForAgent(store.rates, booking.agentSlug).nationalParkIncluded
                                ? 'Included — no Exc park fee'
                                : `Not included — Exc price ${ratesForAgent(store.rates, booking.agentSlug).nationalParkFee || DEFAULT_NATIONAL_PARK_FEE} THB (set in Setup)`
                            }
                          >
                            {booking.parkFee === 'Included' ||
                            ratesForAgent(store.rates, booking.agentSlug).nationalParkIncluded
                              ? 'INC'
                              : `Exc: ${ratesForAgent(store.rates, booking.agentSlug).nationalParkFee || DEFAULT_NATIONAL_PARK_FEE}`}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'px-1.5 text-right text-[11px] tabular-nums',
                              issued ? 'text-neutral-400' : undefined,
                              !issued && row.noTransferDiscount > 0 ? 'font-medium text-rose-700' : undefined,
                            )}
                            title={
                              !row.noTransfer
                                ? 'Has transfer'
                                : row.billingType === 'prebuy'
                                  ? 'No Transfer — discount applies to Invoice agents only'
                                  : row.noTransferDiscount > 0
                                    ? `No Transfer −${NO_TRANSFER_DISCOUNT_PER_PERSON} × ${Math.max(0, booking.adults) + Math.max(0, booking.children)} AD+CH`
                                    : 'No Transfer'
                            }
                          >
                            {!row.noTransfer
                              ? ''
                              : row.noTransferDiscount > 0
                                ? `−${formatInvoiceMoney(row.noTransferDiscount)}`
                                : 'No TF'}
                          </TableCell>
                          <TableCell className="px-1.5 text-right tabular-nums">
                            {row.extraCharge > 0 ? formatInvoiceMoney(row.extraCharge) : '—'}
                          </TableCell>
                          <TableCell className="truncate px-1.5" title={booking.note.trim() || undefined}>
                            <span
                              className={cn(
                                issued ? 'text-neutral-400' : 'text-teal-900/70',
                              )}
                            >
                              {booking.note.trim() || '—'}
                            </span>
                          </TableCell>
                          <TableCell
                            className={cn(
                              'px-1.5 text-right font-medium tabular-nums',
                              issued ? 'text-neutral-400' : 'text-teal-950',
                            )}
                            title={
                              row.billingType === 'prebuy' && booking.noShowDateMove
                                ? (booking.lateChangeFee ?? 0) > 0
                                  ? `Heads deducted on ${formatShortDate(booking.movedFrom?.date ?? booking.date)}`
                                  : 'Heads deducted from the agent\'s pre-buy'
                                : row.billingType === 'prebuy'
                                  ? 'Heads deducted from the agent\'s pre-buy'
                                  : 'Pax count — this agent is billed the tour price'
                            }
                          >
                            {row.billingType === 'prebuy' ? row.deductHeads : '—'}
                          </TableCell>
                          <TableCell
                            className={cn(
                              'px-1.5 text-right font-medium',
                              issued ? 'text-neutral-400' : 'text-teal-950',
                            )}
                            title={
                              row.billingType === 'prebuy' &&
                              booking.noShowDateMove &&
                              (booking.lateChangeFee ?? 0) > 0
                                ? (() => {
                                    const move = prebuyNoShowMoveMoney(booking)
                                    return `Deducted on ${formatShortDate(move.fromDate)}. Next line: Extra Charge for Changed date ${move.perPerson} THB / person (${formatInvoiceMoney(move.amount)})`
                                  })()
                                : undefined
                            }
                          >
                            {issued && row.invoice ? (
                              <button
                                type="button"
                                className="text-[11px] font-semibold text-teal-700/80 hover:text-teal-950"
                                title={`Open invoice ${row.invoice.number} — delete it in Invoices tab to unlock this booking`}
                                onClick={(event) => {
                                  event.stopPropagation()
                                  openPreview(row.invoice!, 'invoice')
                                  goTab('documents')
                                }}
                              >
                                {row.invoice.number}
                              </button>
                            ) : row.hasRates ? (
                              <span className="inline-flex items-center justify-end gap-1.5">
                                {row.amountStale ? (
                                  <BillFlag
                                    label="Changed"
                                    title={`Booking now totals ${formatInvoiceMoney(row.liveTotal)} THB. Invoice still shows ${formatInvoiceMoney(row.billTotal)} THB — open the bill to update.`}
                                  />
                                ) : null}
                                {formatInvoiceMoney(row.billTotal)}
                              </span>
                            ) : (
                              <span className="text-xs text-rose-500" title="Set rates in Setup first">No rate</span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={11} />
                      <TableCell>Sum</TableCell>
                      <TableCell className="text-right tabular-nums text-teal-950">
                        {selectedCodes.length > 0 ? selectedHeads : pageHeads}
                      </TableCell>
                      <TableCell className="text-right text-teal-950">
                        {formatInvoiceMoney(
                          selectedCodes.length > 0 ? selectedGuestTotal : pageGuestTotal,
                        )}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </div>
            )}
          </Surface>
        </>
      ) : tab === 'documents' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-teal-900/55">
              {invoices.length} invoice{invoices.length === 1 ? '' : 's'}
              {selectedDocs.length > 0 ? ` · ${selectedDocs.length} selected` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => void exportDocuments('csv')}
              >
                <Download className="size-3.5" />
                CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => void exportDocuments('xlsx')}
              >
                <Download className="size-3.5" />
                Excel
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => void createBillingNoteFromInvoices()}
              >
                Create billing note
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => void createCreditNotesFromInvoices()}
                title="Reverse selected invoice(s) as credit note(s)"
              >
                Credit note
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl text-amber-700 hover:text-amber-900"
                onClick={undoPaidSelected}
              >
                <Undo2 className="size-3.5" />
                Clear payments
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl text-rose-600 hover:text-rose-800"
                onClick={deleteSelectedDocs}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </div>
          </div>
          <Surface className="overflow-hidden">
            {invoices.length === 0 ? (
              <EmptyState>No invoices in this range yet.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={invoices.length > 0 && selectedDocs.length === invoices.length}
                          onChange={toggleAllDocs}
                          className="size-4 rounded border-teal-900/20"
                        />
                      </TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[1%] whitespace-nowrap pr-1">Status</TableHead>
                      <TableHead className="w-[1%] whitespace-nowrap pl-1 text-right">Balance</TableHead>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Send</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((doc) => {
                      const balance = invoiceBalance(doc)
                      const paidTotal = invoicePaidTotal(doc)
                      const fullyPaid = balance <= 0.009 && paidTotal > 0
                      return (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedDocs.includes(doc.id)}
                            onChange={() => toggleDoc(doc.id)}
                            className="size-4 rounded border-teal-900/20"
                          />
                        </TableCell>
                        <TableCell className="font-medium text-teal-950">{doc.number}</TableCell>
                        <TableCell>{doc.agentName}</TableCell>
                        <TableCell>{formatInvoiceDate(doc.issueDate)}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInvoiceMoney(doc.grandTotal)}
                        </TableCell>
                        <TableCell className="pr-1">
                          <InvoicePayStatus
                            doc={doc}
                            today={portalToday}
                            onConfirm={(invoice, details) => void confirmPayment(invoice, details)}
                            onUndoLast={(invoice) => void undoLastPayment(invoice)}
                            onClearAll={(invoice) => void clearAllPayments(invoice)}
                            onOpenReceipt={(invoice, paymentId) =>
                              openPreview(invoice, 'receipt', paymentId)
                            }
                          />
                        </TableCell>
                        <TableCell
                          className={cn(
                            'pl-1 text-right text-[13px] font-semibold tabular-nums whitespace-nowrap',
                            fullyPaid
                              ? 'text-emerald-700'
                              : balance > 0.009
                                ? 'text-orange-700'
                                : 'text-teal-900/35',
                          )}
                        >
                          {fullyPaid
                            ? 'Paid Full'
                            : balance > 0.009
                              ? formatInvoiceMoney(balance)
                              : '—'}
                        </TableCell>
                        <TableCell>
                          {invoicePayments(doc).length > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              {invoicePayments(doc).map((payment) =>
                                payment.receiptNo ? (
                                  <button
                                    key={payment.id}
                                    type="button"
                                    className="text-left text-sm font-medium text-teal-700 hover:text-teal-950"
                                    onClick={() => openPreview(doc, 'receipt', payment.id)}
                                    title={`${formatInvoiceMoney(payment.amount)} · ${formatInvoiceDate(payment.paidDate)}`}
                                  >
                                    {payment.receiptNo}
                                  </button>
                                ) : null,
                              )}
                            </div>
                          ) : (
                            <span className="text-teal-900/35">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className={cn(
                              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                              doc.sendToAgent
                                ? 'bg-teal-800 text-white'
                                : 'bg-teal-950/[0.04] text-teal-900/45 ring-1 ring-teal-900/10',
                            )}
                            onClick={() => void toggleSendToAgent(doc)}
                            title={
                              doc.sendToAgent
                                ? 'Marked to send to the agent. Click to set Not send.'
                                : 'Not send. Click to mark Send to the agent.'
                            }
                          >
                            {doc.sendToAgent ? 'Send' : 'Not send'}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() => {
                                setEditInvoiceIsNew(false)
                                setEditInvoice(doc)
                              }}
                            >
                              Edit
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() => openPreview(doc)}
                            >
                              View
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() => printDoc(doc)}
                            >
                              <Printer className="size-3.5" />
                              Print
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </Surface>
        </>
      ) : tab === 'notes' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-teal-900/55">
              {billingNotes.length} billing note{billingNotes.length === 1 ? '' : 's'}
              {selectedDocs.length > 0 ? ` · ${selectedDocs.length} selected` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl text-rose-600 hover:text-rose-800"
                onClick={deleteSelectedDocs}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </div>
          </div>
          <Surface className="overflow-hidden">
            {billingNotes.length === 0 ? (
              <EmptyState>
                No billing notes yet. On the Invoices tab, select two or more invoices from the same
                agent, then create a billing note.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={
                            billingNotes.length > 0 && selectedDocs.length === billingNotes.length
                          }
                          onChange={toggleAllDocs}
                          className="size-4 rounded border-teal-900/20"
                        />
                      </TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Invoices</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billingNotes.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedDocs.includes(doc.id)}
                            onChange={() => toggleDoc(doc.id)}
                            className="size-4 rounded border-teal-900/20"
                          />
                        </TableCell>
                        <TableCell className="font-medium text-teal-950">{doc.number}</TableCell>
                        <TableCell>{doc.agentName}</TableCell>
                        <TableCell>{formatInvoiceDate(doc.issueDate)}</TableCell>
                        <TableCell>{doc.notes || `${doc.linkedInvoiceIds.length} invoice(s)`}</TableCell>
                        <TableCell className="text-right">
                          {formatInvoiceMoney(doc.grandTotal)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() => setPreview(doc)}
                            >
                              View
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() => printDoc(doc)}
                            >
                              <Printer className="size-3.5" />
                              Print
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Surface>
        </>
      ) : tab === 'credits' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-teal-900/55">
              {creditNotes.length} credit note{creditNotes.length === 1 ? '' : 's'}
              {selectedDocs.length > 0 ? ` · ${selectedDocs.length} selected` : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => void exportDocuments('csv')}
              >
                <Download className="size-3.5" />
                CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl text-rose-600 hover:text-rose-800"
                onClick={deleteSelectedDocs}
              >
                <Trash2 className="size-3.5" />
                Delete
              </Button>
            </div>
          </div>
          <Surface className="overflow-hidden">
            {creditNotes.length === 0 ? (
              <EmptyState>
                No credit notes yet. On the Invoices tab, select invoice(s) then Credit note.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={
                            creditNotes.length > 0 && selectedDocs.length === creditNotes.length
                          }
                          onChange={toggleAllDocs}
                          className="size-4 rounded border-teal-900/20"
                        />
                      </TableHead>
                      <TableHead>No.</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Linked</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creditNotes.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selectedDocs.includes(doc.id)}
                            onChange={() => toggleDoc(doc.id)}
                            className="size-4 rounded border-teal-900/20"
                          />
                        </TableCell>
                        <TableCell className="font-medium text-teal-950">{doc.number}</TableCell>
                        <TableCell>{doc.agentName}</TableCell>
                        <TableCell>{formatInvoiceDate(doc.issueDate)}</TableCell>
                        <TableCell className="truncate text-teal-900/60" title={doc.notes}>
                          {doc.notes || '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-rose-700">
                          {formatInvoiceMoney(doc.grandTotal)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() => openPreview(doc, 'credit_note')}
                            >
                              View
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() => printDoc(doc)}
                            >
                              <Printer className="size-3.5" />
                              Print
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Surface>
        </>
      ) : tab === 'summary' ? (
        <InvoiceMonthlySummary
          invoices={store.invoices.filter((doc) => docInWorkProgram(doc))}
          rates={store.rates}
          bookings={bookings.filter((booking) => booking.program === billProgram)}
          fromDate={fromDate}
          toDate={toDate}
        />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-teal-900/55">
              {receipts.length} receipt{receipts.length === 1 ? '' : 's'} · each payment issues its own
              receipt
            </p>
          </div>
          <Surface className="overflow-hidden">
            {receipts.length === 0 ? (
              <EmptyState>
                No receipts yet. Record a full or partial payment on an invoice — each payment gets its
                own receipt number.
              </EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Receipt No.</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Channel</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.map(({ doc, payment }) => (
                      <TableRow key={`${doc.id}-${payment.id}`}>
                        <TableCell className="font-medium text-teal-950">
                          {payment.receiptNo}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="text-sm font-medium text-teal-700 hover:text-teal-950"
                            onClick={() => {
                              openPreview(doc, 'invoice')
                              goTab('documents')
                            }}
                          >
                            {doc.number}
                          </button>
                        </TableCell>
                        <TableCell>{doc.agentName}</TableCell>
                        <TableCell>{formatInvoiceDate(payment.paidDate)}</TableCell>
                        <TableCell className="text-xs text-teal-900/65">
                          {formatPaymentChannel(payment.channel)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatInvoiceMoney(payment.amount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() => openPreview(doc, 'receipt', payment.id)}
                            >
                              View
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-8 rounded-lg"
                              onClick={() => printDoc(doc, 'receipt', payment.id)}
                            >
                              <Printer className="size-3.5" />
                              Print
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </Surface>
        </>
      )}
      </div>

      <InvoiceEditDialog
        doc={editInvoice}
        isNew={editInvoiceIsNew}
        open={editInvoice !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditInvoice(null)
            setEditInvoiceIsNew(false)
          }
        }}
        onSave={saveEditedInvoice}
        liveItemsForCodes={(codes) =>
          bookings
            .filter((booking) => codes.includes(booking.code))
            .flatMap((booking) => bookingInvoiceItems(booking, false))
        }
        guestByBookingCode={guestByBookingCode}
      />

      <Dialog open={preview !== null} onOpenChange={(open) => { if (!open) closePreview() }}>
        <DialogContent
          showCloseButton
          className="flex max-h-[92vh] w-full max-w-[calc(100%-1.5rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl print:hidden"
        >
          {preview ? (
            <>
              <DialogHeader className="border-b border-teal-900/8 px-5 py-4 pr-12">
                <DialogTitle>{previewTitle(preview)}</DialogTitle>
                <DialogDescription>
                  {preview.agentName}
                  {currentPreviewMode(preview) === 'receipt' && previewPaymentId
                    ? (() => {
                        const payment = invoicePayments(preview).find(
                          (row) => row.id === previewPaymentId,
                        )
                        return payment
                          ? ` · paid ${formatInvoiceDate(payment.paidDate)} · ${formatInvoiceMoney(payment.amount)} THB`
                          : ` · ${formatInvoiceMoney(preview.grandTotal)} THB`
                      })()
                    : ` · ${formatInvoiceDate(preview.issueDate)} · ${formatInvoiceMoney(preview.grandTotal)} THB`}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 px-4 py-4">
                <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <InvoicePrintSheet
                    doc={preview}
                    settings={store.settings}
                    linked={store.invoices}
                    mode={currentPreviewMode(preview)}
                    paymentId={previewPaymentId}
                    guests={guestByBookingCode}
                  />
                </div>
              </div>
              <DialogFooter className="sm:justify-between">
                <p className="self-center text-xs text-teal-900/50">
                  {shareNote || 'Print or share this bill from the popup.'}
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  {currentPreviewMode(preview) === 'invoice' ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 rounded-xl"
                      onClick={() => {
                        setEditInvoiceIsNew(false)
                        setEditInvoice(preview)
                        closePreview()
                      }}
                    >
                      Edit
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 rounded-xl"
                    onClick={() => void shareDoc(preview)}
                  >
                    <Share2 className="size-3.5" />
                    Share
                  </Button>
                  <Button
                    type="button"
                    className="h-10 rounded-xl"
                    onClick={() =>
                      printDoc(preview, currentPreviewMode(preview), previewPaymentId)
                    }
                  >
                    <Printer className="size-3.5" />
                    Print
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {preview ? (
        <div className="invoice-print-root hidden print:block">
          <InvoicePrintSheet
            doc={preview}
            settings={store.settings}
            guests={guestByBookingCode}
            linked={store.invoices}
            mode={currentPreviewMode(preview)}
            paymentId={previewPaymentId}
          />
        </div>
      ) : null}
    </div>
  )
}
