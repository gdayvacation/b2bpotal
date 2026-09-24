'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { CalendarIcon, FileText, Printer, Settings2 } from 'lucide-react'
import { InvoicePrintBundle, InvoicePrintSheet } from '@/components/admin/admin-invoice-print'
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
  invoicesForBookings,
  majorityProgram,
  newInvoiceDocument,
  ratesForAgent,
  type InvoiceDocument,
  type InvoiceKind,
} from '@/lib/invoice'
import {
  formatPaxBreakdown,
  isActiveBooking,
  type Booking,
  type CheckInAttendance,
} from '@/lib/types'
import { dateFromISO, formatShortDate, todayISO, toISODate } from '@/lib/format'

type Tab = 'bills' | 'documents' | 'receipts'
type GroupBy = 'date' | 'agent'

function isTab(value: string | null): value is Tab {
  return value === 'bills' || value === 'documents' || value === 'receipts'
}

type BillRow = {
  booking: Booking
  attendance: CheckInAttendance | null
  guestTotal: number
  invoice?: InvoiceDocument
}

function guestRateTotal(
  booking: Pick<Booking, 'adults' | 'children' | 'infants' | 'tourLeaders'>,
  rates: ReturnType<typeof ratesForAgent>,
) {
  return (
    booking.adults * rates.adultPrice +
    booking.children * rates.childPrice +
    booking.infants * rates.infantPrice +
    booking.tourLeaders * rates.tourLeaderPrice
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
  const [fromDate, setFromDate] = useState(todayISO())
  const [toDate, setToDate] = useState(todayISO())
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [agentSlug, setAgentSlug] = useState('all')
  const [includePending, setIncludePending] = useState(true)
  const [includeOtherService, setIncludeOtherService] = useState(false)
  const [selectedCodes, setSelectedCodes] = useState<string[]>([])
  const [selectedDocs, setSelectedDocs] = useState<string[]>([])
  const [preview, setPreview] = useState<InvoiceDocument | null>(null)
  const [message, setMessage] = useState('')

  const invoiced = useMemo(() => invoicedBookingCodes(store.invoices), [store.invoices])

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
  }

  function goTab(next: Tab) {
    setTab(next)
    const params = new URLSearchParams(searchParams.toString())
    if (next === 'bills') params.delete('tab')
    else params.set('tab', next)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  const rows = useMemo<BillRow[]>(() => {
    return bookings
      .filter((booking) => booking.date >= fromDate && booking.date <= toDate)
      .filter((booking) => (agentSlug === 'all' ? true : booking.agentSlug === agentSlug))
      .filter((booking) => {
        const attendance = getCheckInAttendance(booking.date, booking.program, booking.code)
        if (booking.status === 'Cancelled') return true
        if (attendance === 'checked' || attendance === 'no-show') return true
        return includePending
      })
      .sort((a, b) =>
        groupBy === 'agent'
          ? a.agentName.localeCompare(b.agentName) || a.date.localeCompare(b.date) || a.code.localeCompare(b.code)
          : a.date.localeCompare(b.date) || a.agentName.localeCompare(b.agentName) || a.code.localeCompare(b.code),
      )
      .map((booking) => {
        const rates = ratesForAgent(store.rates, booking.agentSlug)
        return {
          booking,
          attendance: getCheckInAttendance(booking.date, booking.program, booking.code),
          guestTotal: guestRateTotal(booking, rates),
          invoice: store.invoices.find(
            (doc) =>
              doc.kind === 'invoice' &&
              doc.items.some((item) => item.bookingCode === booking.code),
          ),
        }
      })
  }, [
    agentSlug,
    bookings,
    fromDate,
    getCheckInAttendance,
    groupBy,
    includePending,
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

  const receipts = useMemo(
    () => documents.filter((doc) => doc.status === 'paid'),
    [documents],
  )

  const selectedBookings = rows
    .filter((row) => selectedCodes.includes(row.booking.code))
    .map((row) => row.booking)

  const selectedDocuments = store.invoices.filter((doc) => selectedDocs.includes(doc.id))

  const selectedGuestTotal = rows
    .filter((row) => selectedCodes.includes(row.booking.code))
    .reduce((sum, row) => sum + row.guestTotal, 0)
  const pageGuestTotal = rows.reduce((sum, row) => sum + row.guestTotal, 0)

  function toggleCode(code: string) {
    setSelectedCodes((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    )
  }

  function toggleDoc(id: string) {
    setSelectedDocs((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function toggleAllBills() {
    if (selectedCodes.length === rows.length) setSelectedCodes([])
    else setSelectedCodes(rows.map((row) => row.booking.code))
  }

  function toggleAllDocs() {
    if (selectedDocs.length === documents.length) setSelectedDocs([])
    else setSelectedDocs(documents.map((doc) => doc.id))
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

  async function createFromBookings(kind: InvoiceKind, markPaidAfter = false) {
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
      const already = agentBookings.filter((booking) => invoiced.has(booking.code))
      if (already.length > 0 && kind === 'invoice') {
        const ok = window.confirm(
          `${already.length} selected booking(s) already have an invoice. Create another one anyway?`,
        )
        if (!ok) continue
      }
      const rates = ratesForAgent(store.rates, slug)
      const items = agentBookings.flatMap((booking) =>
        buildInvoiceItemsForBooking(booking, rates, { includeOtherService }),
      )
      if (items.length === 0) continue
      const doc = newInvoiceDocument({
        existing,
        kind,
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
        : kind === 'billing_note'
          ? `Created ${created.length} billing note(s). First page is the summary.`
          : `Created ${created.length} invoice(s). Print includes a billing-note summary page.`,
    )
    return created
  }

  async function createBillingNoteFromInvoices() {
    const source = selectedDocuments.filter((doc) => doc.kind === 'invoice')
    if (source.length === 0) {
      setMessage('Select one or more invoices to wrap in a billing note.')
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
    await store.addDocuments(created)
    setSelectedDocs([])
    setPreview(created[0] ?? null)
    setMessage(`Created ${created.length} billing note(s).`)
  }

  async function markSelectedPaid() {
    const fromDocs = selectedDocuments
    const fromBookings = invoicesForBookings(store.invoices, selectedCodes)
    const unpaid = [...fromDocs, ...fromBookings].filter((doc) => doc.status !== 'paid')
    const unique = unpaid.filter((doc, index) => unpaid.findIndex((row) => row.id === doc.id) === index)
    if (unique.length === 0) {
      if (selectedCodes.length > 0 && fromBookings.length === 0) {
        const ok = window.confirm('These bookings are not invoiced yet. Create invoices and mark them paid?')
        if (!ok) return
        await createFromBookings('invoice', true)
        return
      }
      setMessage('Select unpaid invoices or invoiced bookings to mark paid.')
      return
    }
    const updated = await store.markPaid(unique.map((doc) => doc.id))
    setSelectedCodes([])
    setSelectedDocs([])
    setPreview(updated[0] ?? null)
    goTab('receipts')
    setMessage(`Issued ${updated.length} receipt(s) from the paid invoice(s).`)
  }

  function printDoc(doc: InvoiceDocument) {
    setPreview(doc)
    window.setTimeout(() => window.print(), 200)
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
        description="Check-in bookings become invoices. After an invoice is marked paid, a receipt is issued from that same bill."
        actions={
          <Link href="/admin/invoices/setup">
            <Button type="button" variant="outline" className="h-10 rounded-xl">
              <Settings2 className="size-3.5" />
              Setup
            </Button>
          </Link>
        }
      />

      <div className="mb-4">
        <SegmentedControl>
          <Segment active={tab === 'bills'} onClick={() => goTab('bills')}>
            Bills
          </Segment>
          <Segment active={tab === 'documents'} onClick={() => goTab('documents')}>
            Invoices
          </Segment>
          <Segment active={tab === 'receipts'} onClick={() => goTab('receipts')}>
            Receipts
          </Segment>
        </SegmentedControl>
      </div>

      <Surface className="mb-4 p-4 sm:p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="space-y-2">
            <SoftLabel>View</SoftLabel>
            <SegmentedControl>
              <Segment active={groupBy === 'date'} onClick={() => setGroupBy('date')}>
                By date
              </Segment>
              <Segment active={groupBy === 'agent'} onClick={() => setGroupBy('agent')}>
                By agent
              </Segment>
            </SegmentedControl>
          </div>
          <div className="space-y-2">
            <SoftLabel>Dates</SoftLabel>
            <div className="flex flex-wrap items-center gap-2">
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 min-w-[14rem] justify-start gap-2 font-normal"
                    />
                  }
                >
                  <CalendarIcon className="size-4 text-teal-700/60" />
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      const today = todayISO()
                      setFromDate(today)
                      setToDate(today)
                      setCalendarOpen(false)
                    }}
                  >
                    Today
                  </Button>
                </PopoverContent>
              </Popover>
            </div>
          </div>
          <div className="space-y-2">
            <SoftLabel htmlFor="invoice-agent">Agent</SoftLabel>
            <select
              id="invoice-agent"
              value={agentSlug}
              onChange={(event) => setAgentSlug(event.target.value)}
              className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm text-teal-950 outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
            >
              <option value="all">All agents</option>
              {agentOptions.map(([slug, name]) => (
                <option key={slug} value={slug}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className="mt-4 flex items-center gap-2 text-sm text-teal-900/70">
          <input
            type="checkbox"
            checked={includePending}
            onChange={(event) => setIncludePending(event.target.checked)}
            className="size-4 rounded border-teal-900/20"
          />
          Include bookings not yet checked in
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm text-teal-900/70">
          <input
            type="checkbox"
            checked={includeOtherService}
            onChange={(event) => setIncludeOtherService(event.target.checked)}
            className="size-4 rounded border-teal-900/20"
          />
          Add other service charge from agency setup
        </label>
      </Surface>

      {message ? (
        <p className="mb-4 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-950">
          {message}
        </p>
      ) : null}

      {tab === 'bills' ? (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-teal-900/55">
              {rows.length} check-in booking{rows.length === 1 ? '' : 's'}
              {selectedCodes.length > 0
                ? ` · ${selectedCodes.length} selected · ${formatInvoiceMoney(selectedGuestTotal)} THB`
                : ''}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                className="h-10 rounded-xl"
                onClick={() => createFromBookings('invoice')}
              >
                <FileText className="size-3.5" />
                Make invoice
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={() => createFromBookings('billing_note')}
              >
                Billing note
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={markSelectedPaid}
              >
                Mark as PAID
              </Button>
            </div>
          </div>
          <Surface className="overflow-hidden">
            {rows.length === 0 ? (
              <EmptyState>No check-in bookings in this date range.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={selectedCodes.length === rows.length}
                          onChange={toggleAllBills}
                          className="size-4 rounded border-teal-900/20"
                        />
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Voucher</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead className="w-28 max-w-28">Guest</TableHead>
                      <TableHead>Program</TableHead>
                      <TableHead>Pax</TableHead>
                      <TableHead className="w-20">Check-in</TableHead>
                      <TableHead>Bill</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => {
                      const { booking } = row
                      return (
                        <TableRow key={booking.code}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedCodes.includes(booking.code)}
                              onChange={() => toggleCode(booking.code)}
                              className="size-4 rounded border-teal-900/20"
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {formatInvoiceDate(booking.date)}
                          </TableCell>
                          <TableCell className="font-medium text-teal-950">
                            {booking.agentRef || booking.code}
                          </TableCell>
                          <TableCell>{booking.agentName}</TableCell>
                          <TableCell className="max-w-28 truncate" title={booking.leadGuest}>
                            {booking.leadGuest}
                          </TableCell>
                          <TableCell>{booking.program === 'PP' ? 'PP' : 'JB'}</TableCell>
                          <TableCell>{formatPaxBreakdown(booking)}</TableCell>
                          <TableCell className="w-20 text-xs">
                            {checkInStatusLabel(row.attendance, !isActiveBooking(booking))}
                          </TableCell>
                          <TableCell>
                            {row.invoice ? (
                              <button
                                type="button"
                                className="text-sm font-medium text-teal-700 hover:text-teal-950"
                                onClick={() => setPreview(row.invoice ?? null)}
                              >
                                {row.invoice.status === 'paid' ? 'Paid' : row.invoice.number}
                              </button>
                            ) : (
                              <span className="text-teal-900/40">Open</span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-medium text-teal-950">
                            {formatInvoiceMoney(row.guestTotal)}
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
              {documents.length} invoice{documents.length === 1 ? '' : 's'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={createBillingNoteFromInvoices}
              >
                Billing note from selected
              </Button>
              <Button type="button" className="h-10 rounded-xl" onClick={markSelectedPaid}>
                Mark as PAID
              </Button>
            </div>
          </div>
          <Surface className="overflow-hidden">
            {documents.length === 0 ? (
              <EmptyState>No invoices or billing notes in this range yet.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <input
                          type="checkbox"
                          checked={documents.length > 0 && selectedDocs.length === documents.length}
                          onChange={toggleAllDocs}
                          className="size-4 rounded border-teal-900/20"
                        />
                      </TableHead>
                      <TableHead>Number</TableHead>
                      <TableHead>Kind</TableHead>
                      <TableHead>Agent</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {documents.map((doc) => (
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
                        <TableCell>
                          {doc.kind === 'billing_note' ? 'Billing note' : 'Invoice'}
                        </TableCell>
                        <TableCell>{doc.agentName}</TableCell>
                        <TableCell>{formatInvoiceDate(doc.issueDate)}</TableCell>
                        <TableCell className="text-right">
                          {formatInvoiceMoney(doc.grandTotal)}
                        </TableCell>
                        <TableCell>{doc.status === 'paid' ? 'PAID' : 'Unpaid'}</TableCell>
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

      {preview ? (
        <div className="invoice-preview-host mt-6">
          <div className="mb-3 flex items-center justify-between print:hidden">
            <p className="text-sm font-medium text-teal-950">
              {tab === 'receipts'
                ? `Receipt · ${preview.receiptNo ?? preview.number} · from ${preview.number}`
                : `Preview · ${preview.number}${preview.kind === 'invoice' ? ' · first page is the billing-note summary' : ''}`}
            </p>
            <div className="flex gap-2">
              <Button type="button" className="h-10 rounded-xl" onClick={() => printDoc(preview)}>
                <Printer className="size-3.5" />
                Print
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="h-10 rounded-xl"
                onClick={() => setPreview(null)}
              >
                Close
              </Button>
            </div>
          </div>
          <div className="invoice-print-root rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
            {tab === 'receipts' ? (
              <InvoicePrintSheet doc={preview} settings={store.settings} mode="receipt" />
            ) : (
              <InvoicePrintBundle doc={preview} settings={store.settings} linked={store.invoices} />
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
