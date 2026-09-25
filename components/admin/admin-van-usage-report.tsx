'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarIcon, ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { EmptyState, PageHeader, Segment, SegmentedControl, SoftLabel, Surface } from '@/components/ui-primitives'
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
import {
  daysInMonthISO,
  formatLongDate,
  formatMonthLabel,
  formatShortDate,
  formatThb,
  startOfThisMonth,
  toISODate,
} from '@/lib/format'
import { usePortalDefaultDateISO } from '@/lib/use-portal-today'
import {
  isActiveBooking,
  isSpecialTransfer,
  specialTransferDirectionLabel,
  specialTransferKindLabel,
  vanHasSavedMeta,
  type Booking,
  type DayVehiclePlan,
  type Program,
  type SpecialTransferKind,
  type VanMeta,
} from '@/lib/types'
import { bookingPaxOnVan, listVanNumbers } from '@/lib/vehicle-assign'
import { cn } from '@/lib/utils'

type ProgramFilter = 'all' | Program
type FleetFilter = 'all' | 'own' | 'partner'
type RangeMode = 'day' | 'month'
type TypeFilter = 'all' | 'regular' | 'special'
type SortKey = 'date' | 'van' | 'name' | 'plate' | 'company' | 'program' | 'type' | 'charge'

type UsageRow = {
  id: string
  date: string
  program: Program
  van: number
  name: string
  plate: string
  phone: string
  outsourced: boolean
  company: string
  pax: number
  incomplete: boolean
  specialKind?: SpecialTransferKind
  transferIn: boolean
  transferOut: boolean
  chargeAmount: number
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'date', label: 'Date' },
  { value: 'van', label: 'Van number' },
  { value: 'name', label: 'Van name' },
  { value: 'plate', label: 'Plate number' },
  { value: 'company', label: 'Company' },
  { value: 'program', label: 'Program' },
  { value: 'type', label: 'Type' },
  { value: 'charge', label: 'Charge' },
]

export function AdminVanUsageReport({ onBack }: { onBack: () => void }) {
  const { bookings, getDayVehiclePlan, resolveVanMeta } = usePortal()
  const [selectedDate, setSelectedDate, portalToday] = usePortalDefaultDateISO()
  const [range, setRange] = useState<RangeMode>('month')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [program, setProgram] = useState<ProgramFilter>('all')
  const [fleet, setFleet] = useState<FleetFilter>('all')
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [company, setCompany] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const selectedDateObj = new Date(`${selectedDate}T12:00:00`)
  const monthLabel = formatMonthLabel(selectedDate)
  const dateLabel = range === 'month' ? monthLabel : formatLongDate(selectedDate)

  const allRows = useMemo(() => {
    const programs: Program[] = program === 'all' ? ['PP', 'James Bond'] : [program]
    const dates = range === 'month' ? daysInMonthISO(selectedDate) : [selectedDate]
    const rows: UsageRow[] = []
    for (const date of dates) {
      const dayBookings = bookings.filter(
        (booking) => booking.date === date && isActiveBooking(booking),
      )
      for (const prog of programs) {
        const plan = getDayVehiclePlan(date, prog)
        const programBookings = dayBookings.filter((booking) => booking.program === prog)
        rows.push(...buildUsageRows(date, prog, plan, programBookings, resolveVanMeta))
      }
    }
    return rows
  }, [bookings, getDayVehiclePlan, program, range, resolveVanMeta, selectedDate])

  const companyOptions = useMemo(() => {
    const names = new Set<string>()
    for (const row of allRows) {
      if (row.company) names.add(row.company)
    }
    return [...names].sort((a, b) => a.localeCompare(b))
  }, [allRows])

  const filteredRows = useMemo(
    () =>
      allRows.filter((row) => {
        if (fleet === 'own' && row.outsourced) return false
        if (fleet === 'partner' && !row.outsourced) return false
        if (typeFilter === 'regular' && row.specialKind) return false
        if (typeFilter === 'special' && !row.specialKind) return false
        if (company !== 'all' && row.company !== company) return false
        return true
      }),
    [allRows, company, fleet, typeFilter],
  )

  const rows = useMemo(
    () => [...filteredRows].sort((a, b) => compareUsageRows(a, b, sortKey)),
    [filteredRows, sortKey],
  )

  const visibleIds = useMemo(() => filteredRows.map((row) => row.id), [filteredRows])
  const visibleKey = visibleIds.join('\0')

  useEffect(() => {
    setCompany('all')
  }, [selectedDate, program, fleet])

  useEffect(() => {
    setSelectedIds(visibleKey ? visibleKey.split('\0') : [])
  }, [visibleKey])

  const selectedRows = useMemo(() => {
    const chosen = new Set(selectedIds)
    return rows.filter((row) => chosen.has(row.id))
  }, [rows, selectedIds])

  const allSelected = rows.length > 0 && selectedRows.length === rows.length
  const someSelected = selectedRows.length > 0 && !allSelected
  const ownCount = rows.filter((row) => !row.outsourced).length
  const partnerCount = rows.filter((row) => row.outsourced).length
  const specialCount = rows.filter((row) => row.specialKind).length
  const totalPax = rows.reduce((sum, row) => sum + row.pax, 0)
  const totalCharge = rows.reduce((sum, row) => sum + row.chargeAmount, 0)
  const programLabel =
    program === 'PP'
      ? 'PP · Phi Phi Islands'
      : program === 'James Bond'
        ? 'James Bond · Phang Nga Bay'
        : 'All programs'
  const fleetLabel = fleet === 'own' ? 'Own vans' : fleet === 'partner' ? 'Partner vans' : 'All vans'
  const sortLabel = SORT_OPTIONS.find((option) => option.value === sortKey)?.label ?? sortKey
  const companyLabel = company === 'all' ? 'All companies' : company

  function selectDate(date: Date | undefined) {
    if (!date) return
    setSelectedDate(toISODate(date))
    setCalendarOpen(false)
  }

  function toggleAll() {
    setSelectedIds(allSelected ? [] : rows.map((row) => row.id))
  }

  function toggleRow(id: string) {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    )
  }

  function handlePrint() {
    if (selectedRows.length === 0) return
    const previousTitle = document.title
    document.title =
      range === 'month'
        ? `VAN Monthly ${monthLabel}`
        : `VAN Usage ${formatShortDate(selectedDate)}`
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
          title={range === 'month' ? 'VAN Monthly Report' : 'VAN Usage Report'}
          description="Daily or monthly van list — including Private Van and Other Service special transfers with charge."
          actions={
            <Button type="button" onClick={handlePrint} disabled={selectedRows.length === 0}>
              <Printer data-icon="inline-start" />
              Print PDF · {selectedRows.length} selected
            </Button>
          }
        />

        <Surface className="mb-5 p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-2">
              <SoftLabel>Period</SoftLabel>
              <div className="flex flex-wrap items-center gap-2">
                <SegmentedControl>
                  <Segment active={range === 'day'} onClick={() => setRange('day')}>
                    Day
                  </Segment>
                  <Segment active={range === 'month'} onClick={() => setRange('month')}>
                    Month
                  </Segment>
                </SegmentedControl>
                {range === 'month' ? (
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() =>
                        setSelectedDate(
                          toISODate(
                            new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth() - 1, 1),
                          ),
                        )
                      }
                    >
                      <ChevronLeft />
                    </Button>
                    <div className="min-w-[9.5rem] text-center text-sm font-semibold text-teal-950">
                      {monthLabel}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon-sm"
                      onClick={() =>
                        setSelectedDate(
                          toISODate(
                            new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth() + 1, 1),
                          ),
                        )
                      }
                    >
                      <ChevronRight />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedDate(toISODate(startOfThisMonth()))}
                    >
                      This month
                    </Button>
                  </div>
                ) : (
                  <>
                    <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
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
                        {formatShortDate(selectedDate)}
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={selectedDateObj}
                          onSelect={selectDate}
                          defaultMonth={selectedDateObj}
                        />
                      </PopoverContent>
                    </Popover>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedDate(portalToday)}
                    >
                      Today
                    </Button>
                  </>
                )}
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
              <SoftLabel>Fleet</SoftLabel>
              <SegmentedControl>
                <Segment active={fleet === 'all'} onClick={() => setFleet('all')}>
                  All
                </Segment>
                <Segment active={fleet === 'own'} onClick={() => setFleet('own')}>
                  Own
                </Segment>
                <Segment active={fleet === 'partner'} onClick={() => setFleet('partner')}>
                  Partner
                </Segment>
              </SegmentedControl>
            </div>

            <div className="space-y-2">
              <SoftLabel>Type</SoftLabel>
              <SegmentedControl>
                <Segment active={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>
                  All
                </Segment>
                <Segment active={typeFilter === 'regular'} onClick={() => setTypeFilter('regular')}>
                  Regular
                </Segment>
                <Segment active={typeFilter === 'special'} onClick={() => setTypeFilter('special')}>
                  Special
                </Segment>
              </SegmentedControl>
            </div>

            <div className="space-y-2">
              <SoftLabel htmlFor="van-usage-sort">Sort by</SoftLabel>
              <select
                id="van-usage-sort"
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
              <SoftLabel htmlFor="van-usage-company">Company</SoftLabel>
              <select
                id="van-usage-company"
                value={company}
                onChange={(event) => setCompany(event.target.value)}
                className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm text-teal-950 outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
              >
                <option value="all">All companies</option>
                {companyOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Surface>

        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label="Vans used" value={String(rows.length)} detail={dateLabel} />
          <SummaryCard label="Own" value={String(ownCount)} detail="G'Day fleet" />
          <SummaryCard label="Partner" value={String(partnerCount)} detail="Outsource companies" />
          <SummaryCard label="Special transfers" value={String(specialCount)} detail="Private / Other" />
          <SummaryCard
            label="Charge"
            value={formatThb(totalCharge) || '0'}
            detail={programLabel}
          />
        </div>

        <Surface className="overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/8 px-4 py-3 sm:px-5">
            <div>
              <p className="text-sm font-semibold text-teal-950">
                {range === 'month' ? 'Monthly van list' : 'Daily van list'}
              </p>
              <p className="text-xs text-teal-900/45">
                {rows.length} van{rows.length === 1 ? '' : 's'} · {selectedRows.length} selected ·
                sorted by {sortLabel.toLowerCase()} · {fleetLabel} · {companyLabel}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-teal-950">{dateLabel}</p>
              <p className="text-xs font-medium text-teal-800/55">{programLabel}</p>
            </div>
          </div>

          {rows.length === 0 ? (
            <EmptyState>
              No vans used on this date. Assign vans in Arrange vehicles, then return here to match
              partner billing.
            </EmptyState>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        className="size-3.5 rounded border-teal-900/25 accent-violet-700"
                        checked={allSelected}
                        ref={(el) => {
                          if (!el) return
                          el.indeterminate = someSelected
                        }}
                        onChange={toggleAll}
                        aria-label="Select all vans"
                      />
                    </TableHead>
                    {range === 'month' ? <TableHead className="min-w-[7rem]">Date</TableHead> : null}
                    <TableHead className="w-16">Van</TableHead>
                    <TableHead className="min-w-[10rem]">Van name</TableHead>
                    <TableHead className="min-w-[8rem]">Type</TableHead>
                    <TableHead className="min-w-[8rem]">Transfer</TableHead>
                    <TableHead className="min-w-[8rem]">Plate number</TableHead>
                    <TableHead className="min-w-[8rem]">Telephone</TableHead>
                    <TableHead className="min-w-[10rem]">Company</TableHead>
                    <TableHead>Program</TableHead>
                    <TableHead className="w-16 text-right">Pax</TableHead>
                    <TableHead className="min-w-[6rem] text-right">Charge</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(row.incomplete && 'bg-amber-50/40')}
                    >
                      <TableCell>
                        <input
                          type="checkbox"
                          className="size-3.5 rounded border-teal-900/25 accent-violet-700"
                          checked={selectedIds.includes(row.id)}
                          onChange={() => toggleRow(row.id)}
                          aria-label={`Select van ${row.van}`}
                        />
                      </TableCell>
                      {range === 'month' ? (
                        <TableCell className="whitespace-nowrap text-sm text-teal-900/70">
                          {formatShortDate(row.date)}
                        </TableCell>
                      ) : null}
                      <TableCell className="font-semibold tabular-nums text-teal-950">
                        {row.van}
                      </TableCell>
                      <TableCell className="font-medium text-teal-950">
                        {row.name || '—'}
                        {row.incomplete ? (
                          <span className="mt-0.5 block text-[11px] font-normal text-amber-800/80">
                            Missing name or plate
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {row.specialKind ? (
                          <span className="rounded-md bg-sky-950/6 px-1.5 py-0.5 text-xs font-medium text-sky-900">
                            {specialTransferKindLabel(row.specialKind)}
                          </span>
                        ) : (
                          <span className="text-teal-900/45">Regular</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-teal-900/70">
                        {specialTransferDirectionLabel(row) || '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{row.plate || '—'}</TableCell>
                      <TableCell className="whitespace-nowrap">{row.phone || '—'}</TableCell>
                      <TableCell>
                        {row.outsourced ? (
                          <span className="rounded-md bg-violet-950/6 px-1.5 py-0.5 text-xs font-medium text-violet-900">
                            {row.company || 'Outsource'}
                          </span>
                        ) : (
                          <span className="text-teal-900/45">Own</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-teal-900/70">
                        {programShort(row.program)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.pax || '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatThb(row.chargeAmount) || '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Surface>
      </div>

      <VanUsagePrintSheet
        dateLabel={dateLabel}
        programLabel={programLabel}
        fleetLabel={fleetLabel}
        companyLabel={companyLabel}
        sortLabel={sortLabel}
        showDate={range === 'month'}
        rows={selectedRows}
      />

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          html, body {
            width: 100% !important;
            height: auto !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            overflow: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          .van-usage-print-sheet,
          .van-usage-print-sheet * {
            visibility: visible !important;
          }
          .van-usage-print-sheet {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
            color: #0f3d3e !important;
            box-shadow: none !important;
            border: 0 !important;
            z-index: 99999 !important;
          }
          .van-usage-print-sheet table {
            width: 100% !important;
            border-collapse: collapse !important;
          }
        }
      `}</style>
    </div>
  )
}

function VanUsagePrintSheet({
  dateLabel,
  programLabel,
  fleetLabel,
  companyLabel,
  sortLabel,
  showDate,
  rows,
}: {
  dateLabel: string
  programLabel: string
  fleetLabel: string
  companyLabel: string
  sortLabel: string
  showDate: boolean
  rows: UsageRow[]
}) {
  const printedAt = new Date().toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
  const partnerCount = rows.filter((row) => row.outsourced).length
  const ownCount = rows.length - partnerCount
  const specialCount = rows.filter((row) => row.specialKind).length
  const totalPax = rows.reduce((sum, row) => sum + row.pax, 0)
  const totalCharge = rows.reduce((sum, row) => sum + row.chargeAmount, 0)

  return (
    <div className="van-usage-print-sheet hidden print:block">
      <div className="mb-3 flex items-end justify-between gap-4 border-b-2 border-teal-900/25 pb-2.5">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-teal-700/70 uppercase">
            G&apos;Day Tours Phuket · {showDate ? 'VAN Monthly Report' : 'VAN Usage Report'}
          </p>
          <h1 className="mt-0.5 text-lg font-bold text-teal-950">{dateLabel}</h1>
          <p className="mt-0.5 text-xs text-teal-900/60">
            {programLabel} · {fleetLabel} · {companyLabel} · sorted by {sortLabel.toLowerCase()}
          </p>
          <p className="mt-0.5 text-[10px] text-teal-900/50">
            Tick Match after checking plate and company against the partner van invoice.
          </p>
        </div>
        <div className="text-right text-[11px] text-teal-900/65">
          <p>
            <span className="font-semibold text-teal-950">{rows.length}</span> vans ·{' '}
            <span className="font-semibold text-teal-950">{ownCount}</span> own ·{' '}
            <span className="font-semibold text-teal-950">{partnerCount}</span> partner ·{' '}
            <span className="font-semibold text-teal-950">{specialCount}</span> special
          </p>
          <p>
            <span className="font-semibold text-teal-950">{totalPax}</span> pax
            {totalCharge > 0 ? (
              <>
                {' '}
                · <span className="font-semibold text-teal-950">{formatThb(totalCharge)}</span>
              </>
            ) : null}
          </p>
          <p className="mt-0.5">Printed {printedAt}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-500">No vans selected.</p>
      ) : (
        <table className="w-full text-left text-[10px] leading-tight">
          <thead>
            <tr className="bg-teal-950/[0.06]">
              <th className="w-8 border border-teal-900/15 px-1.5 py-1.5 text-center font-bold tracking-wide text-teal-900/80 uppercase">
                Match
              </th>
              {showDate ? (
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold tracking-wide text-teal-900/80 uppercase">
                  Date
                </th>
              ) : null}
              <th className="w-10 border border-teal-900/15 px-1.5 py-1.5 font-bold tracking-wide text-teal-900/80 uppercase">
                Van
              </th>
              <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold tracking-wide text-teal-900/80 uppercase">
                Van name
              </th>
              <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold tracking-wide text-teal-900/80 uppercase">
                Type
              </th>
              <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold tracking-wide text-teal-900/80 uppercase">
                Transfer
              </th>
              <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold tracking-wide text-teal-900/80 uppercase">
                Plate
              </th>
              <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold tracking-wide text-teal-900/80 uppercase">
                Telephone
              </th>
              <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold tracking-wide text-teal-900/80 uppercase">
                Company
              </th>
              <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold tracking-wide text-teal-900/80 uppercase">
                Program
              </th>
              <th className="w-10 border border-teal-900/15 px-1.5 py-1.5 text-right font-bold tracking-wide text-teal-900/80 uppercase">
                Pax
              </th>
              <th className="border border-teal-900/15 px-1.5 py-1.5 text-right font-bold tracking-wide text-teal-900/80 uppercase">
                Charge
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="border border-teal-900/10 px-1.5 py-2 text-center">
                  <span className="mx-auto block size-3.5 rounded-sm border border-teal-900/40" />
                </td>
                {showDate ? (
                  <td className="border border-teal-900/10 px-1.5 py-2 whitespace-nowrap">
                    {formatShortDate(row.date)}
                  </td>
                ) : null}
                <td className="border border-teal-900/10 px-1.5 py-2 font-semibold tabular-nums">
                  {row.van}
                </td>
                <td className="border border-teal-900/10 px-1.5 py-2 font-medium">
                  {row.name || '—'}
                </td>
                <td className="border border-teal-900/10 px-1.5 py-2">
                  {row.specialKind ? specialTransferKindLabel(row.specialKind) : 'Regular'}
                </td>
                <td className="border border-teal-900/10 px-1.5 py-2">
                  {specialTransferDirectionLabel(row) || '—'}
                </td>
                <td className="border border-teal-900/10 px-1.5 py-2 whitespace-nowrap">
                  {row.plate || '—'}
                </td>
                <td className="border border-teal-900/10 px-1.5 py-2 whitespace-nowrap">
                  {row.phone || '—'}
                </td>
                <td className="border border-teal-900/10 px-1.5 py-2">
                  {row.outsourced ? row.company || 'Outsource' : 'Own'}
                </td>
                <td className="border border-teal-900/10 px-1.5 py-2">
                  {programShort(row.program)}
                </td>
                <td className="border border-teal-900/10 px-1.5 py-2 text-right tabular-nums">
                  {row.pax || '—'}
                </td>
                <td className="border border-teal-900/10 px-1.5 py-2 text-right tabular-nums">
                  {formatThb(row.chargeAmount) || '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-6 grid grid-cols-3 gap-8 text-[11px] text-teal-900/70">
        <p>
          Prepared by
          <span className="mt-4 block border-b border-teal-900/25" />
        </p>
        <p>
          Checked vs partner invoice
          <span className="mt-4 block border-b border-teal-900/25" />
        </p>
        <p>
          Confirmed by
          <span className="mt-4 block border-b border-teal-900/25" />
        </p>
      </div>
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
    <div className="rounded-2xl bg-gradient-to-br from-violet-50/90 via-white to-white p-4 ring-1 ring-violet-900/8">
      <p className="text-xs font-medium text-violet-800/70">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold tracking-tight text-teal-950">
        {value}
      </p>
      <p className="mt-0.5 truncate text-xs text-teal-900/45">{detail}</p>
    </div>
  )
}

function buildUsageRows(
  date: string,
  program: Program,
  plan: DayVehiclePlan,
  bookings: Booking[],
  resolveMeta: (
    van: number,
    dayMeta?: VanMeta | null,
  ) => VanMeta & { fromFleet: boolean; incomplete: boolean },
): UsageRow[] {
  return usedVanNumbers(plan).map((van) => {
    const meta = resolveMeta(van, plan.vanMeta[String(van)] ?? null)
    const pax = bookings.reduce(
      (sum, booking) => sum + bookingPaxOnVan(booking, plan.assignments[booking.code], van),
      0,
    )
    const company = meta.outsourced === true ? meta.outsourceCompany?.trim() || '' : ''
    return {
      id: `${date}|${program}|${van}`,
      date,
      program,
      van,
      name: meta.driver.trim(),
      plate: meta.plate.trim(),
      phone: meta.phone.trim(),
      outsourced: meta.outsourced === true,
      company,
      pax,
      incomplete: !meta.driver.trim() || !meta.plate.trim(),
      specialKind: isSpecialTransfer(meta) ? meta.specialKind : undefined,
      transferIn: meta.transferIn === true,
      transferOut: meta.transferOut === true,
      chargeAmount: meta.chargeAmount ?? 0,
    }
  })
}

function usedVanNumbers(plan: DayVehiclePlan): number[] {
  const nums = new Set(listVanNumbers(plan.assignments))
  for (const [key, meta] of Object.entries(plan.vanMeta ?? {})) {
    const van = Number(key)
    if (!Number.isFinite(van) || van < 1) continue
    if (vanHasSavedMeta(meta)) nums.add(van)
  }
  return [...nums].sort((a, b) => a - b)
}

function compareUsageRows(a: UsageRow, b: UsageRow, sortKey: SortKey) {
  let primary = 0
  switch (sortKey) {
    case 'date':
      primary = a.date.localeCompare(b.date)
      break
    case 'name':
      primary = (a.name || '~').localeCompare(b.name || '~')
      break
    case 'plate':
      primary = (a.plate || '~').localeCompare(b.plate || '~')
      break
    case 'company':
      primary = companySortValue(a).localeCompare(companySortValue(b))
      break
    case 'program':
      primary = a.program.localeCompare(b.program)
      break
    case 'type':
      primary = (specialTransferKindLabel(a.specialKind) || 'Regular').localeCompare(
        specialTransferKindLabel(b.specialKind) || 'Regular',
      )
      break
    case 'charge':
      primary = a.chargeAmount - b.chargeAmount
      break
    case 'van':
    default:
      primary = a.van - b.van
      break
  }
  if (primary !== 0) return primary
  if (a.date !== b.date) return a.date.localeCompare(b.date)
  if (a.program !== b.program) return a.program.localeCompare(b.program)
  return a.van - b.van
}

function companySortValue(row: UsageRow) {
  if (row.outsourced) return row.company || 'Outsource'
  return 'Own'
}

function programShort(program: Program) {
  return program === 'PP' ? 'Phi Phi' : 'James Bond'
}
