'use client'

import { useMemo, useState } from 'react'
import { CalendarIcon, Download, FileSpreadsheet, Printer } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { usePortal } from '@/components/portal-provider'
import { StatusBadge } from '@/components/status-badge'
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
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatLongDate, formatShortDate, toISODate } from '@/lib/format'
import {
  bookingsToReportRows,
  downloadReportCsv,
  downloadReportXlsx,
  reportExportFilename,
} from '@/lib/report-export'
import {
  formatPaxBreakdown,
  isActiveBooking,
  totalPassengers,
  type Booking,
  type Program,
} from '@/lib/types'
import { cn } from '@/lib/utils'

/** Prototype “today” — matches dashboard seed data. */
const TODAY = '2026-09-17'
const TODAY_DATE = new Date(2026, 8, 17)

type ProgramFilter = 'all' | Program
type SortKey = 'pickup' | 'zone' | 'agent' | 'code' | 'guest'

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'pickup', label: 'Pickup time' },
  { value: 'zone', label: 'Pickup zone' },
  { value: 'agent', label: 'Agent' },
  { value: 'code', label: 'Booking code' },
  { value: 'guest', label: 'Lead guest' },
]

export function AdminReports() {
  const { bookings, agents } = usePortal()
  const [range, setRange] = useState<DateRange | undefined>({
    from: TODAY_DATE,
    to: TODAY_DATE,
  })
  const [program, setProgram] = useState<ProgramFilter>('all')
  const [agentSlug, setAgentSlug] = useState('all')
  const [includeCancelled, setIncludeCancelled] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('pickup')
  const [exporting, setExporting] = useState<'csv' | 'xlsx' | null>(null)

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const agent of agents) map.set(agent.slug, agent.name)
    for (const booking of bookings) {
      if (!map.has(booking.agentSlug)) map.set(booking.agentSlug, booking.agentName)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [agents, bookings])

  const fromIso = range?.from ? toISODate(range.from) : TODAY
  const toIso = range?.to ? toISODate(range.to) : fromIso

  const rows = useMemo(() => {
    const filtered = bookings.filter((booking) => {
      if (booking.date < fromIso || booking.date > toIso) return false
      if (program !== 'all' && booking.program !== program) return false
      if (agentSlug !== 'all' && booking.agentSlug !== agentSlug) return false
      if (!includeCancelled && !isActiveBooking(booking)) return false
      return true
    })
    return [...filtered].sort((a, b) => compareBookings(a, b, sortKey))
  }, [bookings, fromIso, toIso, program, agentSlug, includeCancelled, sortKey])

  const activeRows = rows.filter(isActiveBooking)
  const totalPax = sumPax(activeRows)
  const ppPax = sumPax(activeRows.filter((b) => b.program === 'PP'))
  const jbPax = sumPax(activeRows.filter((b) => b.program === 'James Bond'))

  const dateLabel =
    fromIso === toIso
      ? formatLongDate(fromIso)
      : `${formatShortDate(fromIso)} – ${formatShortDate(toIso)}`
  const programLabel =
    program === 'PP' ? 'Phi Phi Islands' : program === 'James Bond' ? 'Phang Nga Bay' : 'All programs'
  const agentLabel =
    agentSlug === 'all'
      ? 'All agents'
      : (agentOptions.find(([slug]) => slug === agentSlug)?.[1] ?? agentSlug)
  const sortLabel = SORT_OPTIONS.find((o) => o.value === sortKey)?.label ?? sortKey

  const rangePickerLabel = (() => {
    if (!range?.from) return 'Select trip date'
    const from = formatShortDate(toISODate(range.from))
    if (!range.to || toISODate(range.from) === toISODate(range.to)) return from
    return `${from} – ${formatShortDate(toISODate(range.to))}`
  })()

  function setToday() {
    setRange({ from: TODAY_DATE, to: TODAY_DATE })
  }

  function handlePrint() {
    window.print()
  }

  function handleDownloadCsv() {
    const exportRows = bookingsToReportRows(rows)
    downloadReportCsv(exportRows, reportExportFilename(fromIso, toIso, 'csv'))
  }

  async function handleDownloadExcel() {
    setExporting('xlsx')
    try {
      const exportRows = bookingsToReportRows(rows)
      await downloadReportXlsx(exportRows, reportExportFilename(fromIso, toIso, 'xlsx'))
    } finally {
      setExporting(null)
    }
  }

  const canExport = rows.length > 0 && exporting === null

  return (
    <div className="mx-auto max-w-7xl">
      <div className="print:hidden">
        <PageHeader
          title="Report"
          description="Filter bookings by date, program, and agent — then print or download CSV / Excel."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleDownloadCsv}
                disabled={!canExport}
              >
                <Download data-icon="inline-start" />
                CSV
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => void handleDownloadExcel()}
                disabled={!canExport}
              >
                <FileSpreadsheet data-icon="inline-start" />
                {exporting === 'xlsx' ? 'Exporting…' : 'Excel'}
              </Button>
              <Button type="button" onClick={handlePrint} disabled={rows.length === 0}>
                <Printer data-icon="inline-start" />
                Print A4 landscape
              </Button>
            </div>
          }
        />

        <Surface className="mb-5 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <SoftLabel>Trip date</SoftLabel>
              <div className="flex flex-wrap items-center gap-2">
                <Popover>
                  <PopoverTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 min-w-[12rem] justify-start gap-2 font-normal"
                      />
                    }
                  >
                    <CalendarIcon className="size-4 text-teal-700/60" />
                    {rangePickerLabel}
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-0">
                    <Calendar
                      mode="range"
                      selected={range}
                      onSelect={setRange}
                      numberOfMonths={1}
                      defaultMonth={range?.from ?? TODAY_DATE}
                    />
                  </PopoverContent>
                </Popover>
                <Button type="button" variant="ghost" size="sm" onClick={setToday}>
                  Today
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <SoftLabel>Program</SoftLabel>
              <SegmentedControl>
                <Segment active={program === 'all'} onClick={() => setProgram('all')}>
                  All
                </Segment>
                <Segment active={program === 'PP'} onClick={() => setProgram('PP')}>
                  Phi Phi
                </Segment>
                <Segment active={program === 'James Bond'} onClick={() => setProgram('James Bond')}>
                  James Bond
                </Segment>
              </SegmentedControl>
            </div>

            <div className="space-y-2">
              <SoftLabel htmlFor="report-agent">Agent</SoftLabel>
              <select
                id="report-agent"
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

            <div className="space-y-2">
              <SoftLabel htmlFor="report-sort">Sort by</SoftLabel>
              <select
                id="report-sort"
                value={sortKey}
                onChange={(event) => setSortKey(event.target.value as SortKey)}
                className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm text-teal-950 outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
              >
                {SORT_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <SoftLabel>Status</SoftLabel>
              <SegmentedControl>
                <Segment active={!includeCancelled} onClick={() => setIncludeCancelled(false)}>
                  Active only
                </Segment>
                <Segment active={includeCancelled} onClick={() => setIncludeCancelled(true)}>
                  Include cancelled
                </Segment>
              </SegmentedControl>
            </div>
          </div>
        </Surface>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Bookings" value={String(activeRows.length)} detail={dateLabel} />
          <SummaryCard label="Total pax" value={String(totalPax)} detail={programLabel} />
          {program !== 'James Bond' ? (
            <SummaryCard label="PP pax" value={String(ppPax)} detail="Phi Phi Islands" />
          ) : null}
          {program !== 'PP' ? (
            <SummaryCard label="James Bond pax" value={String(jbPax)} detail="Phang Nga Bay" />
          ) : null}
        </div>

        <Surface className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/8 px-4 py-3 sm:px-5">
            <div>
              <p className="text-sm font-semibold text-teal-950">Preview</p>
              <p className="text-xs text-teal-900/45">
                {rows.length} row{rows.length === 1 ? '' : 's'} · sorted by {sortLabel.toLowerCase()}
                {includeCancelled ? ' · includes cancelled' : ''}
              </p>
            </div>
            <p className="text-xs font-medium text-teal-800/55">
              {agentLabel} · {programLabel}
            </p>
          </div>

          {rows.length === 0 ? (
            <EmptyState>No bookings match these filters.</EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Code</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Program</TableHead>
                    <TableHead>Agent</TableHead>
                    <TableHead>Ref</TableHead>
                    <TableHead>Guest</TableHead>
                    <TableHead>Pax</TableHead>
                    <TableHead>Zone / Time</TableHead>
                    <TableHead>Hotel</TableHead>
                    <TableHead>Room</TableHead>
                    <TableHead>Park</TableHead>
                    <TableHead>Canoe</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((booking) => (
                    <TableRow
                      key={booking.code}
                      className={cn(!isActiveBooking(booking) && 'opacity-55')}
                    >
                      <TableCell className="font-medium text-teal-950">{booking.code}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {formatShortDate(booking.date)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {programShort(booking.program)}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[9rem] truncate" title={booking.agentName}>
                          {booking.agentName}
                        </div>
                      </TableCell>
                      <TableCell className="text-teal-900/55">{booking.agentRef || '—'}</TableCell>
                      <TableCell>
                        <div className="max-w-[8rem] truncate" title={booking.leadGuest}>
                          {booking.leadGuest}
                        </div>
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        <span className="font-medium text-teal-950">
                          {totalPassengers(booking)}
                        </span>
                        <span className="ml-1 text-xs text-teal-900/40">
                          {formatPaxBreakdown(booking)}
                        </span>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {booking.pickupZone}
                        <span className="text-teal-900/35"> · </span>
                        {booking.pickupTime}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[9rem] truncate" title={booking.pickupHotel}>
                          {booking.pickupHotel || '—'}
                        </div>
                      </TableCell>
                      <TableCell>{booking.roomNumber || '—'}</TableCell>
                      <TableCell className="text-xs">{booking.parkFee}</TableCell>
                      <TableCell className="text-xs">
                        {booking.program === 'James Bond' ? (booking.canoe ?? '—') : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="max-w-[8rem] truncate text-xs text-teal-900/55" title={booking.note}>
                          {booking.note || '—'}
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={booking.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Surface>
      </div>

      <ReportPrintSheet
        dateLabel={dateLabel}
        programLabel={programLabel}
        agentLabel={agentLabel}
        sortLabel={sortLabel}
        includeCancelled={includeCancelled}
        rows={rows}
        bookingCount={activeRows.length}
        totalPax={totalPax}
        ppPax={ppPax}
        jbPax={jbPax}
        program={program}
      />

      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 8mm;
          }
          html, body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden !important;
          }
          .report-print-sheet,
          .report-print-sheet * {
            visibility: visible !important;
          }
          .report-print-sheet {
            display: block !important;
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            right: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: black !important;
            box-shadow: none !important;
            border: 0 !important;
            z-index: 99999 !important;
          }
          .report-print-sheet table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
        }
      `}</style>
    </div>
  )
}

function ReportPrintSheet({
  dateLabel,
  programLabel,
  agentLabel,
  sortLabel,
  includeCancelled,
  rows,
  bookingCount,
  totalPax,
  ppPax,
  jbPax,
  program,
}: {
  dateLabel: string
  programLabel: string
  agentLabel: string
  sortLabel: string
  includeCancelled: boolean
  rows: Booking[]
  bookingCount: number
  totalPax: number
  ppPax: number
  jbPax: number
  program: ProgramFilter
}) {
  const printedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="report-print-sheet hidden print:block">
      <div className="mb-3 flex items-end justify-between gap-4 border-b border-neutral-300 pb-2">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.14em] text-neutral-500 uppercase">
            Gday B2B Portal · Booking report
          </p>
          <h1 className="mt-0.5 text-lg font-bold text-neutral-900">{dateLabel}</h1>
          <p className="mt-0.5 text-xs text-neutral-600">
            {programLabel} · {agentLabel}
            {includeCancelled ? ' · includes cancelled' : ''} · sorted by {sortLabel.toLowerCase()}
          </p>
        </div>
        <div className="text-right text-[11px] text-neutral-600">
          <p>
            <span className="font-semibold text-neutral-900">{bookingCount}</span> bookings ·{' '}
            <span className="font-semibold text-neutral-900">{totalPax}</span> pax
          </p>
          {program === 'all' ? (
            <p>
              PP {ppPax} · JB {jbPax}
            </p>
          ) : null}
          <p className="mt-0.5">Printed {printedAt}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">No bookings match these filters.</p>
      ) : (
        <table className="w-full text-left text-[9.5px] leading-tight">
          <thead>
            <tr className="border-b-2 border-neutral-800">
              <th className="py-1 pr-1.5 font-semibold">Code</th>
              <th className="py-1 pr-1.5 font-semibold">Date</th>
              <th className="py-1 pr-1.5 font-semibold">Prog</th>
              <th className="py-1 pr-1.5 font-semibold">Agent</th>
              <th className="py-1 pr-1.5 font-semibold">Ref</th>
              <th className="py-1 pr-1.5 font-semibold">Guest</th>
              <th className="py-1 pr-1.5 font-semibold">Pax</th>
              <th className="py-1 pr-1.5 font-semibold">Breakdown</th>
              <th className="py-1 pr-1.5 font-semibold">Zone</th>
              <th className="py-1 pr-1.5 font-semibold">Time</th>
              <th className="py-1 pr-1.5 font-semibold">Hotel</th>
              <th className="py-1 pr-1.5 font-semibold">Room</th>
              <th className="py-1 pr-1.5 font-semibold">Park</th>
              <th className="py-1 pr-1.5 font-semibold">Canoe</th>
              <th className="py-1 pr-1.5 font-semibold">Note</th>
              <th className="py-1 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((booking) => (
              <tr
                key={booking.code}
                className={cn(
                  'border-b border-neutral-200',
                  !isActiveBooking(booking) && 'text-neutral-400',
                )}
              >
                <td className="py-1 pr-1.5 font-medium whitespace-nowrap">{booking.code}</td>
                <td className="py-1 pr-1.5 whitespace-nowrap">{formatShortDate(booking.date)}</td>
                <td className="py-1 pr-1.5 whitespace-nowrap">{programShort(booking.program)}</td>
                <td className="max-w-[6.5rem] truncate py-1 pr-1.5">{booking.agentName}</td>
                <td className="max-w-[4rem] truncate py-1 pr-1.5">{booking.agentRef || '—'}</td>
                <td className="max-w-[5.5rem] truncate py-1 pr-1.5">{booking.leadGuest}</td>
                <td className="py-1 pr-1.5 font-semibold tabular-nums">
                  {totalPassengers(booking)}
                </td>
                <td className="py-1 pr-1.5 whitespace-nowrap tabular-nums">
                  {formatPaxBreakdown(booking)}
                </td>
                <td className="py-1 pr-1.5 whitespace-nowrap">{booking.pickupZone}</td>
                <td className="py-1 pr-1.5 whitespace-nowrap">{booking.pickupTime}</td>
                <td className="max-w-[6rem] truncate py-1 pr-1.5">{booking.pickupHotel || '—'}</td>
                <td className="py-1 pr-1.5 whitespace-nowrap">{booking.roomNumber || '—'}</td>
                <td className="py-1 pr-1.5 whitespace-nowrap">
                  {booking.parkFee === 'Included' ? 'Inc' : 'Not'}
                </td>
                <td className="py-1 pr-1.5 whitespace-nowrap">
                  {booking.program === 'James Bond'
                    ? booking.canoe === 'Included'
                      ? 'Inc'
                      : booking.canoe === 'Not Included'
                        ? 'Not'
                        : '—'
                    : '—'}
                </td>
                <td className="max-w-[5rem] truncate py-1 pr-1.5">{booking.note || '—'}</td>
                <td className="py-1 whitespace-nowrap">{statusShort(booking.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
    <div className="rounded-2xl bg-gradient-to-br from-teal-50/90 via-white to-white p-4 ring-1 ring-teal-900/8">
      <p className="text-xs font-medium text-teal-700/70">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-teal-950">
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-teal-900/45">{detail}</p>
    </div>
  )
}

function programShort(program: Program) {
  return program === 'PP' ? 'PP' : 'JB'
}

function statusShort(status: Booking['status']) {
  if (status === 'Pending Pickup Time') return 'Pending'
  return status
}

function sumPax(list: Booking[]) {
  return list.reduce((sum, booking) => sum + totalPassengers(booking), 0)
}

function compareBookings(a: Booking, b: Booking, sortKey: SortKey) {
  const byDate = a.date.localeCompare(b.date)
  if (byDate !== 0) return byDate

  let primary = 0
  switch (sortKey) {
    case 'pickup':
      primary = pickupSortValue(a.pickupTime).localeCompare(pickupSortValue(b.pickupTime))
      if (primary === 0) primary = a.pickupZone.localeCompare(b.pickupZone)
      break
    case 'zone':
      primary = a.pickupZone.localeCompare(b.pickupZone)
      if (primary === 0) primary = pickupSortValue(a.pickupTime).localeCompare(pickupSortValue(b.pickupTime))
      break
    case 'agent':
      primary = a.agentName.localeCompare(b.agentName)
      break
    case 'guest':
      primary = a.leadGuest.localeCompare(b.leadGuest)
      break
    case 'code':
    default:
      primary = a.code.localeCompare(b.code)
      break
  }
  if (primary !== 0) return primary
  return a.code.localeCompare(b.code)
}

/** Normalize times like "07:30" / "Awaiting pickup time" for stable sort. */
function pickupSortValue(time: string) {
  const trimmed = time.trim()
  if (/^\d{1,2}:\d{2}/.test(trimmed)) return trimmed.padStart(5, '0')
  return `~${trimmed}`
}
