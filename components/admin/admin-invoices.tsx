'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from 'cn'
import { ArrowDown, ArrowUp, ArrowUpDown, CalendarIcon, ChevronDown, FileText, Printer, Settings2, Share2, Trash2, Undo2 } from 'lucide-react'
import { InvoiceEditDialog } from '@/components/admin/admin-invoice-edit-dialog'
import { InvoicePrintSheet } from '@/components/admin/admin-invoice-print'
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
  agencyRatesReady,
  buildInvoiceItemsForBooking,
  checkInStatusLabel,
  formatInvoiceDate,
  formatInvoiceMoney,
  invoicedBookingCodes,
  PAYMENT_CHANNELS,
  itemsGrandTotal,
  majorityProgram,
  newInvoiceDocument,
  ratesForAgent,
  type InvoiceDocument,
  type PaymentChannel,
} from '@/lib/invoice'
import {
  formatPaxBreakdown,
  isActiveBooking,
  type Booking,
  type CheckInAttendance,
  type Program,
} from '@/lib/types'
import { addDaysISO, dateFromISO, formatShortDate, todayISO, toISODate } from '@/lib/format'
import { usePortalTodayISO } from '@/lib/use-portal-today'

type Tab = 'bills' | 'documents' | 'notes' | 'receipts'
type GroupBy = 'date' | 'agent'
type PrintMode = 'invoice' | 'billing_note' | 'receipt'
type BillSortKey = 'agent' | 'status'
type BillProgram = Program
type SortDir = 'asc' | 'desc'

function isTab(value: string | null): value is Tab {
  return value === 'bills' || value === 'documents' || value === 'notes' || value === 'receipts'
}

function sheetMode(doc: InvoiceDocument, tab: Tab): PrintMode {
  if (tab === 'receipts') return 'receipt'
  if (doc.kind === 'billing_note') return 'billing_note'
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
  attendance: CheckInAttendance | null
  billTotal: number
  hasRates: boolean
  hasNoShow: boolean
  hasExtra: boolean
  invoice?: InvoiceDocument
}

const EXTRA_LINE_KINDS = new Set(['change_date', 'private_transfer', 'extra_zone', 'other'])

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

function billStatusLabel(row: BillRow) {
  if (!row.invoice) return 'Open'
  if (row.invoice.status === 'paid') return 'Paid'
  return row.invoice.number
}

function billStatusRank(row: BillRow) {
  if (!row.invoice) return 0
  if (row.invoice.status === 'paid') return 2
  return 1
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
          'inline-flex items-center gap-1 rounded-md transition-colors hover:text-teal-900',
          active && 'font-semibold text-teal-900',
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
  onUndoPaid,
}: {
  doc: InvoiceDocument
  today: string
  onConfirm: (doc: InvoiceDocument, details: { paidDate: string; channel: PaymentChannel }) => void
  onUndoPaid: (doc: InvoiceDocument) => void
}) {
  const [open, setOpen] = useState(false)
  const [paidDate, setPaidDate] = useState(today)
  const [channel, setChannel] = useState<PaymentChannel>('deduct_deposit')
  const paid = doc.status === 'paid'

  useEffect(() => {
    if (!open) return
    setPaidDate(doc.paidAt ? doc.paidAt.slice(0, 10) : today)
    setChannel(doc.paymentChannel ?? 'deduct_deposit')
  }, [doc, open, today])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-1.5 py-1 text-left text-sm font-medium outline-none transition-colors hover:bg-teal-950/[0.04] focus-visible:ring-2 focus-visible:ring-teal-700/25',
              paid ? 'text-emerald-700' : 'text-amber-800',
            )}
            aria-label={`${paid ? 'PAID' : 'Unpaid'}. Review payment for ${doc.number}`}
          />
        }
      >
        {paid ? 'PAID' : 'Unpaid'}
        <ChevronDown className="size-3.5 opacity-50" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 gap-3 p-3">
        <div>
          <p className="text-sm font-medium text-teal-950">{doc.number}</p>
          <p className="text-xs text-teal-900/55">
            {paid ? 'Review or change payment details.' : 'Confirm payment to issue the receipt.'}
          </p>
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
          onClick={() => {
            setOpen(false)
            onConfirm(doc, { paidDate, channel })
          }}
        >
          Confirm
        </Button>
        {paid ? (
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full rounded-xl text-amber-800"
            onClick={() => {
              setOpen(false)
              onUndoPaid(doc)
            }}
          >
            Undo PAID
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

export function AdminInvoices() {
  const { agents, bookings, getCheckInAttendance } = usePortal()
  const store = useInvoiceStore()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>(() => {
    const raw = searchParams.get('tab')
    return isTab(raw) ? raw : 'bills'
  })
  const [groupBy, setGroupBy] = useState<GroupBy>('date')
  const [billSort, setBillSort] = useState<{ key: BillSortKey; dir: SortDir } | null>(null)
  const portalToday = usePortalTodayISO()
  const [fromDate, setFromDate] = useState(todayISO())
  const [toDate, setToDate] = useState(todayISO())
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [agentSlug, setAgentSlug] = useState('all')
  const [billProgram, setBillProgram] = useState<BillProgram>('PP')
  const [includePending, setIncludePending] = useState(true)
  const [includeOtherService, setIncludeOtherService] = useState(false)
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [preview, setPreview] = useState<InvoiceDocument | null>(null)
  const [previewMode, setPreviewMode] = useState<PrintMode | null>(null)
  const [editInvoice, setEditInvoice] = useState<InvoiceDocument | null>(null)
  const [editInvoiceIsNew, setEditInvoiceIsNew] = useState(false)
  const [shareNote, setShareNote] = useState('')
  const [message, setMessage] = useState('')

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

  function bookingInvoiceItems(booking: Booking) {
    return buildInvoiceItemsForBooking(booking, ratesForAgent(store.rates, booking.agentSlug), {
      includeOtherService,
      attendance: getCheckInAttendance(booking.date, booking.program, booking.code),
    })
  }

  const rows = useMemo<BillRow[]>(() => {
    const list = bookings
      .filter((booking) => booking.date >= fromDate && booking.date <= toDate)
      .filter((booking) => (agentSlug === 'all' ? true : booking.agentSlug === agentSlug))
      .filter((booking) => booking.program === billProgram)
      .filter((booking) => {
        const attendance = getCheckInAttendance(booking.date, booking.program, booking.code)
        if (booking.status === 'Cancelled') return true
        if (attendance === 'checked' || attendance === 'no-show') return true
        return includePending
      })
      .map((booking) => {
        const rates = ratesForAgent(store.rates, booking.agentSlug)
        const items = bookingInvoiceItems(booking)
        return {
          booking,
          attendance: getCheckInAttendance(booking.date, booking.program, booking.code),
          billTotal: itemsGrandTotal(items),
          hasRates: agencyRatesReady(rates),
          hasNoShow: items.some((item) => item.lineKind === 'no_show'),
          hasExtra: items.some((item) => EXTRA_LINE_KINDS.has(item.lineKind)),
          invoice: store.invoices.find(
            (doc) =>
              doc.kind === 'invoice' &&
              doc.items.some((item) => item.bookingCode === booking.code),
          ),
        }
      })

    return list.sort((a, b) => {
      if (billSort) {
        const dir = billSort.dir === 'asc' ? 1 : -1
        let cmp = 0
        if (billSort.key === 'agent') {
          cmp = a.booking.agentName.localeCompare(b.booking.agentName)
        } else {
          cmp =
            billStatusRank(a) - billStatusRank(b) ||
            billStatusLabel(a).localeCompare(billStatusLabel(b))
        }
        return cmp * dir || a.booking.code.localeCompare(b.booking.code)
      }
      return groupBy === 'agent'
        ? a.booking.agentName.localeCompare(b.booking.agentName) ||
            a.booking.date.localeCompare(b.booking.date) ||
            a.booking.code.localeCompare(b.booking.code)
        : a.booking.date.localeCompare(b.booking.date) ||
            a.booking.agentName.localeCompare(b.booking.agentName) ||
            a.booking.code.localeCompare(b.booking.code)
    })
  }, [
    agentSlug,
    billSort,
    bookings,
    fromDate,
    getCheckInAttendance,
    groupBy,
    includeOtherService,
    includePending,
    billProgram,
    store.invoices,
    store.rates,
    toDate,
  ])

  const documents = useMemo(() => {
    return store.invoices
      .filter((doc) => (agentSlug === 'all' ? true : doc.agentSlug === agentSlug))
      .filter((doc) => {
        const dates = doc.items.map((item) => item.travelDate).filter(Boolean)
        if (dates.length === 0) return doc.issueDate >= fromDate && doc.issueDate <= toDate
        return dates.some((date) => date >= fromDate && date <= toDate)
      })
  }, [agentSlug, fromDate, store.invoices, toDate])

  const invoices = useMemo(
    () => documents.filter((doc) => doc.kind === 'invoice'),
    [documents],
  )
  const billingNotes = useMemo(
    () => documents.filter((doc) => doc.kind === 'billing_note'),
    [documents],
  )
  const receipts = useMemo(
    () => invoices.filter((doc) => doc.status === 'paid'),
    [invoices],
  )
  const listedDocs = tab === 'notes' ? billingNotes : invoices

  const openRows = useMemo(() => rows.filter((row) => !row.invoice), [rows])
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

  const selectedGuestTotal = rows
    .filter((row) => selectedCodes.includes(row.booking.code))
    .reduce((sum, row) => sum + row.billTotal, 0)
  const pageGuestTotal = rows.reduce((sum, row) => sum + row.billTotal, 0)

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

  async function createFromBookings(markPaidAfter = false) {
    if (selectedBookings.length === 0) {
      setMessage('Select one or more check-in bookings first.')
      return
    }
    const missing = [...new Set(selectedBookings.map((booking) => booking.agentSlug))].filter(
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
    for (const [slug, agentBookings] of groupedByAgent(selectedBookings)) {
      const items = agentBookings.flatMap((booking) => bookingInvoiceItems(booking))
      if (items.length === 0) continue
      const doc = newInvoiceDocument({
        existing,
        kind: 'invoice',
        agentSlug: slug,
        agentName: agentBookings[0]!.agentName,
        issueDate: todayISO(),
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
    setPreview(created[0] ?? null)
    goTab(markPaidAfter ? 'receipts' : 'documents')
    setMessage(
      markPaidAfter
        ? `Created invoice(s) and issued ${created.length} receipt(s).`
        : `Created ${created.length} invoice(s).`,
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

  async function toggleSendToAgent(doc: InvoiceDocument) {
    const next = { ...doc, sendToAgent: !doc.sendToAgent }
    await store.replaceDocument(next)
    if (preview?.id === doc.id) setPreview(next)
  }

  async function confirmPayment(
    doc: InvoiceDocument,
    details: { paidDate: string; channel: PaymentChannel },
  ) {
    if (doc.kind !== 'invoice') return
    const paidDate = details.paidDate || todayISO()
    if (doc.status === 'paid') {
      const next = {
        ...doc,
        paidAt: `${paidDate}T12:00:00.000Z`,
        paymentChannel: details.channel,
      }
      await store.replaceDocument(next)
      if (preview?.id === doc.id) setPreview(next)
      setMessage(`Updated payment details on ${doc.number}.`)
      return
    }
    const updated = await store.markPaid([doc.id], [], details)
    const receipt = updated[0]
    setSelectedDocs([])
    if (receipt) openPreview(receipt, 'receipt')
    setMessage(`Issued ${receipt?.receiptNo ?? 'a receipt'} from ${doc.number}.`)
  }

  async function undoDocPaid(doc: InvoiceDocument) {
    if (doc.status !== 'paid') return
    const next = {
      ...doc,
      status: 'unpaid' as const,
      paidAt: null,
      paymentChannel: null,
      receiptNo: null,
    }
    await store.replaceDocument(next)
    if (preview?.id === doc.id) setPreview(next)
    setMessage(`${doc.number} is unpaid again.`)
  }

  function currentPreviewMode(doc: InvoiceDocument) {
    return previewMode ?? sheetMode(doc, tab)
  }

  function openPreview(doc: InvoiceDocument, mode?: PrintMode) {
    setPreviewMode(mode ?? sheetMode(doc, tab))
    setPreview(doc)
  }

  function closePreview() {
    setPreview(null)
    setPreviewMode(null)
  }

  function printDoc(doc: InvoiceDocument, mode?: PrintMode) {
    openPreview(doc, mode)
    window.setTimeout(() => window.print(), 250)
  }

  function previewTitle(doc: InvoiceDocument) {
    const mode = currentPreviewMode(doc)
    if (mode === 'receipt') return `Receipt · ${doc.receiptNo ?? doc.number}`
    if (mode === 'billing_note') return `Billing note · ${doc.number}`
    return `Invoice · ${doc.number}`
  }

  async function shareDoc(doc: InvoiceDocument) {
    const title = previewTitle(doc)
    const text = [
      title,
      doc.agentName,
      `Date ${formatInvoiceDate(doc.issueDate)}`,
      `Total ${formatInvoiceMoney(doc.grandTotal)} THB`,
      doc.status === 'paid' ? 'PAID' : 'Unpaid',
    ].join('\n')
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
        items,
        program: row.booking.program,
      }),
    )
  }

  async function saveEditedInvoice(doc: InvoiceDocument) {
    if (editInvoiceIsNew) {
      await store.addDocuments([doc])
      setMessage(`Created invoice ${doc.number}.`)
    } else {
      await store.replaceDocument(doc)
      setMessage(`Updated ${doc.number}.`)
    }
    setEditInvoice(null)
    setEditInvoiceIsNew(false)
    if (preview?.id === doc.id) setPreview(doc)
  }

  async function deleteSelectedDocs() {
    if (selectedDocs.length === 0) {
      setMessage('Select invoices to delete.')
      return
    }
    const docs = store.invoices.filter((doc) => selectedDocs.includes(doc.id))
    const paidCount = docs.filter((doc) => doc.status === 'paid').length
    if (paidCount > 0) {
      setMessage(`${paidCount} paid invoice(s) cannot be deleted. Undo PAID first.`)
      return
    }
    const label = tab === 'notes' ? 'billing note' : 'invoice'
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
      setMessage('Select paid invoices to undo.')
      return
    }
    const docs = store.invoices.filter(
      (doc) => selectedDocs.includes(doc.id) && doc.status === 'paid',
    )
    if (docs.length === 0) {
      setMessage('No paid invoices selected.')
      return
    }
    const ok = window.confirm(
      `Undo PAID on ${docs.length} invoice(s)? Receipt numbers will be removed.`,
    )
    if (!ok) return
    for (const doc of docs) {
      await store.replaceDocument({
        ...doc,
        status: 'unpaid',
        paidAt: null,
        paymentChannel: null,
        receiptNo: null,
      })
    }
    setSelectedDocs([])
    setMessage(`Reversed ${docs.length} payment(s). Invoices are unpaid again.`)
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
        description="Pick a date first. Then open Bills, Invoices, Billing notes, or Receipts for that date."
        actions={
          <Link href="/admin/invoices/setup">
            <Button type="button" variant="outline" className="h-10 rounded-xl">
              <Settings2 className="size-3.5" />
              Setup
            </Button>
          </Link>
        }
      />

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
                  className="h-8 min-w-[11rem] justify-start gap-1.5 rounded-lg px-2.5 text-xs font-normal"
                />
              }
            >
              <CalendarIcon className="size-3.5 text-teal-700/60" />
              {dateLabel}
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
                Click one day, or click a second day for a range.
              </p>
            </PopoverContent>
          </Popover>
          <select
            id="invoice-agent"
            aria-label="Agent"
            value={agentSlug}
            onChange={(event) => setAgentSlug(event.target.value)}
            className="h-8 min-w-[10rem] rounded-lg border border-teal-900/12 bg-white/80 px-2 text-xs text-teal-950 outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
          >
            <option value="all">All agents</option>
            {agentOptions.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </Surface>

      <div className="mb-4">
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
          <Segment active={tab === 'receipts'} onClick={() => goTab('receipts')}>
            Receipts
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

      {tab === 'bills' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <SegmentedControl className="rounded-xl p-0.5">
                <Segment
                  active={billProgram === 'PP'}
                  onClick={() => {
                    setBillProgram('PP')
                    setSelectedCodes([])
                  }}
                  className="rounded-lg px-2.5 py-1 text-xs"
                >
                  PP
                </Segment>
                <Segment
                  active={billProgram === 'James Bond'}
                  onClick={() => {
                    setBillProgram('James Bond')
                    setSelectedCodes([])
                  }}
                  className="rounded-lg px-2.5 py-1 text-xs"
                >
                  JB
                </Segment>
              </SegmentedControl>
              <SegmentedControl className="rounded-xl p-0.5">
                <Segment
                  active={groupBy === 'date'}
                  onClick={() => setGroupBy('date')}
                  className="rounded-lg px-2.5 py-1 text-xs"
                >
                  By date
                </Segment>
                <Segment
                  active={groupBy === 'agent'}
                  onClick={() => setGroupBy('agent')}
                  className="rounded-lg px-2.5 py-1 text-xs"
                >
                  By agent
                </Segment>
              </SegmentedControl>
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
              <p className="text-sm text-teal-900/55">
                {rows.length} check-in booking{rows.length === 1 ? '' : 's'}
                {selectedCodes.length > 0
                  ? ` · ${selectedCodes.length} selected · ${formatInvoiceMoney(selectedGuestTotal)} THB`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-10 rounded-xl"
                onClick={() => createFromBookings()}
              >
                <FileText className="size-3.5" />
                Make invoice
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
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={allOpenSelected}
                          disabled={openRows.length === 0}
                          onChange={toggleAllBills}
                          className="size-4 rounded border-teal-900/20 disabled:cursor-not-allowed disabled:opacity-40"
                          title={openRows.length === 0 ? 'All bookings on this day already have an invoice' : undefined}
                        />
                      </TableHead>
                      <TableHead className="w-24">Voucher</TableHead>
                      <TableHead>Booking code</TableHead>
                      <BillSortHead
                        column="agent"
                        active={billSort?.key === 'agent'}
                        dir={billSort?.dir ?? 'asc'}
                        onSort={toggleBillSort}
                      >
                        Agent
                      </BillSortHead>
                      <TableHead className="min-w-[10rem]">Guest</TableHead>
                      <TableHead>Pax</TableHead>
                      <TableHead className="min-w-[14rem] w-[14rem]">Note</TableHead>
                      <TableHead className="w-20">Check-in</TableHead>
                      <BillSortHead
                        column="status"
                        active={billSort?.key === 'status'}
                        dir={billSort?.dir ?? 'asc'}
                        onSort={toggleBillSort}
                      >
                        Status
                      </BillSortHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const { booking } = row
                      const issued = Boolean(row.invoice)
                      return (
                        <TableRow
                          key={booking.code}
                          className="cursor-pointer"
                          onClick={() => openBill(row)}
                        >
                          <TableCell
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              checked={selectedCodes.includes(booking.code)}
                              disabled={issued}
                              onChange={() => toggleCode(booking.code, issued)}
                              className="size-4 rounded border-teal-900/20 disabled:cursor-not-allowed disabled:opacity-40"
                              title={issued ? `Already invoiced as ${row.invoice?.number}` : undefined}
                            />
                          </TableCell>
                          <TableCell className="w-24 max-w-24 truncate font-medium text-teal-950" title={booking.agentRef?.trim() || undefined}>
                            {booking.agentRef?.trim() || '—'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-teal-950">
                            {booking.code}
                          </TableCell>
                          <TableCell>{booking.agentName}</TableCell>
                          <TableCell className="min-w-[10rem]" title={booking.leadGuest}>
                            <span className="inline-flex min-w-0 items-center gap-1">
                              <span className="truncate">{booking.leadGuest}</span>
                              {row.hasNoShow ? (
                                <BillFlag label="NS" title="This booking has a no-show guest" />
                              ) : null}
                              {row.hasExtra ? (
                                <BillFlag label="Extra" title="This booking has an extra charge" />
                              ) : null}
                            </span>
                          </TableCell>
                          <TableCell>{formatPaxBreakdown(booking)}</TableCell>
                          <TableCell className="min-w-[14rem] w-[14rem] whitespace-normal">
                            <div
                              className="break-words text-xs leading-snug text-teal-900/70"
                              title={booking.note.trim() || undefined}
                            >
                              {booking.note.trim() || '—'}
                            </div>
                          </TableCell>
                          <TableCell className="w-20 text-xs">
                            {checkInStatusLabel(row.attendance, !isActiveBooking(booking))}
                          </TableCell>
                          <TableCell>
                            {row.invoice ? (
                              billStatusLabel(row)
                            ) : (
                              <span className="text-teal-900/40">Open</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium text-teal-950">
                            {row.hasRates ? (
                              formatInvoiceMoney(row.billTotal)
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
                      <TableCell colSpan={8} />
                      <TableCell>Sum</TableCell>
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
                onClick={createBillingNoteFromInvoices}
              >
                Create billing note
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl text-amber-700 hover:text-amber-900"
                onClick={undoPaidSelected}
              >
                <Undo2 className="size-3.5" />
                Undo PAID
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
                      <TableHead>Status</TableHead>
                      <TableHead>Receipt</TableHead>
                      <TableHead>Send</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((doc) => (
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
                        <TableCell className="text-right">
                          {formatInvoiceMoney(doc.grandTotal)}
                        </TableCell>
                        <TableCell>
                          <InvoicePayStatus
                            doc={doc}
                            today={portalToday}
                            onConfirm={(invoice, details) => void confirmPayment(invoice, details)}
                            onUndoPaid={(invoice) => void undoDocPaid(invoice)}
                          />
                        </TableCell>
                        <TableCell>
                          {doc.status === 'paid' ? (
                            <button
                              type="button"
                              className="text-sm font-medium text-teal-700 hover:text-teal-950"
                              onClick={() => openPreview(doc, 'receipt')}
                            >
                              {doc.receiptNo ?? 'Receipt'}
                            </button>
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
                    ))}
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
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-teal-900/55">
              {receipts.length} receipt{receipts.length === 1 ? '' : 's'} issued from paid invoices
            </p>
          </div>
          <Surface className="overflow-hidden">
            {receipts.length === 0 ? (
              <EmptyState>
                No receipts yet. Mark an invoice as PAID and a receipt number will be issued from that
                same bill.
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
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.map((doc) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium text-teal-950">
                          {doc.receiptNo ?? doc.number}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            className="text-sm font-medium text-teal-700 hover:text-teal-950"
                            onClick={() => {
                              setPreview(doc)
                              goTab('documents')
                            }}
                          >
                            {doc.number}
                          </button>
                        </TableCell>
                        <TableCell>{doc.agentName}</TableCell>
                        <TableCell>
                          {formatInvoiceDate((doc.paidAt ?? doc.issueDate).slice(0, 10))}
                        </TableCell>
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
                  {preview.agentName} · {formatInvoiceDate(preview.issueDate)} ·{' '}
                  {formatInvoiceMoney(preview.grandTotal)} THB
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-50 px-4 py-4">
                <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
                  <InvoicePrintSheet
                    doc={preview}
                    settings={store.settings}
                    linked={store.invoices}
                    mode={currentPreviewMode(preview)}
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
                    onClick={() => printDoc(preview)}
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
            linked={store.invoices}
            mode={currentPreviewMode(preview)}
          />
        </div>
      ) : null}
    </div>
  )
}
