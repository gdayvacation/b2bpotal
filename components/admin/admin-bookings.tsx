'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarIcon,
  Check,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  X,
} from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { usePortal } from '@/components/portal-provider'
import { StatusBadge } from '@/components/status-badge'
import { PageHeader, Segment, SegmentedControl, SoftLabel, Surface } from '@/components/ui-primitives'
import { Button, buttonVariants } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatShortDate, startOfToday, todayISO, toISODate } from '@/lib/format'
import { totalPassengers } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Search only looks from 7 days ago through all future trips (keeps lists fast). */
function searchFromISO() {
  const d = startOfToday()
  d.setDate(d.getDate() - 7)
  return toISODate(d)
}

/** Default list: newest first, capped so the table stays light. */
const RECENT_LIMIT = 200
const PAGE_SIZE = 50

type QuickFilter = 'all' | 'today'
type SortKey = 'code' | 'agent' | 'zone'
type SortDir = 'asc' | 'desc'

function SortableHead({
  column,
  active,
  dir,
  onSort,
  children,
  className,
}: {
  column: SortKey
  active: boolean
  dir: SortDir
  onSort: (key: SortKey) => void
  children: ReactNode
  className?: string
}) {
  const Icon = !active ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  const label = typeof children === 'string' ? children : column
  return (
    <TableHead className={cn('text-teal-800/50', className)}>
      <button
        type="button"
        className={cn(
          'inline-flex items-center gap-1 rounded-md transition-colors hover:text-teal-900',
          active && 'font-semibold text-teal-900',
        )}
        onClick={() => onSort(column)}
        aria-label={`Sort by ${label}${active ? `, currently ${dir === 'asc' ? 'ascending' : 'descending'}` : ''}`}
      >
        {children}
        <Icon className={cn('size-3.5 shrink-0', active ? 'opacity-80' : 'opacity-40')} />
      </button>
    </TableHead>
  )
}

export function AdminBookings() {
  const { bookings, cancelBooking } = usePortal()
  const searchParams = useSearchParams()
  const createdCode = searchParams.get('created')
  const [quick, setQuick] = useState<QuickFilter>('all')
  const [range, setRange] = useState<DateRange | undefined>()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [dismissCreated, setDismissCreated] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const query = search.trim().toLowerCase()
  const isSearching = query.length > 0
  const hasRange = Boolean(range?.from)
  const hasActiveFilter = quick === 'today' || hasRange || isSearching
  const today = todayISO()
  const searchFrom = searchFromISO()

  const filtered = useMemo(() => {
    const fromIso = range?.from ? toISODate(range.from) : null
    const toIso = range?.to ? toISODate(range.to) : fromIso
    const dir = sortDir === 'asc' ? 1 : -1

    return bookings
      .filter((booking) => {
        if (isSearching) {
          if (booking.date < searchFrom) return false
          const haystack = [booking.agentName, booking.leadGuest, booking.pickupHotel]
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(query)) return false
        }
        if (quick === 'today' && booking.date !== today) return false
        if (fromIso && booking.date < fromIso) return false
        if (toIso && booking.date > toIso) return false
        return true
      })
      .slice()
      .sort((a, b) => {
        if (sortKey === 'code') {
          return dir * a.code.localeCompare(b.code, undefined, { numeric: true })
        }
        if (sortKey === 'agent') {
          return (
            dir * a.agentName.localeCompare(b.agentName) ||
            b.date.localeCompare(a.date) ||
            a.code.localeCompare(b.code)
          )
        }
        if (sortKey === 'zone') {
          return (
            dir * a.pickupZone.localeCompare(b.pickupZone) ||
            a.pickupTime.localeCompare(b.pickupTime) ||
            b.date.localeCompare(a.date) ||
            a.code.localeCompare(b.code)
          )
        }
        return b.date.localeCompare(a.date) || b.code.localeCompare(a.code)
      })
  }, [bookings, quick, range, isSearching, query, sortKey, sortDir, today, searchFrom])

  const capped = !hasActiveFilter
  const list = capped ? filtered.slice(0, RECENT_LIMIT) : filtered
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageRows = list.slice(pageStart, pageStart + PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [quick, range, query, sortKey, sortDir])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function clearFilters() {
    setQuick('all')
    setRange(undefined)
    setSearch('')
  }

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'))
      return
    }
    setSortKey(key)
    setSortDir('asc')
  }

  function applyToday() {
    setQuick('today')
    setRange(undefined)
  }

  function applyRange(next: DateRange | undefined) {
    setRange(next)
    if (next?.from) setQuick('all')
  }

  function handleCancel(code: string) {
    if (
      !window.confirm(
        `Cancel booking ${code}? Seats will free up on the departure date. This cannot be undone from here.`,
      )
    ) {
      return
    }
    cancelBooking(code, { bypassCutoff: true })
  }

  const rangeLabel = (() => {
    if (!range?.from) return 'Trip date range'
    const from = formatShortDate(toISODate(range.from))
    if (!range.to || toISODate(range.from) === toISODate(range.to)) return from
    return `${from} – ${formatShortDate(toISODate(range.to))}`
  })()

  const showCreated = Boolean(createdCode) && !dismissCreated
  const showingFrom = list.length === 0 ? 0 : pageStart + 1
  const showingTo = Math.min(pageStart + PAGE_SIZE, list.length)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Bookings"
        description="Partner reservations — default view shows the latest 200. Use filters or search for older trips."
        actions={
          <Link href="/admin/bookings/new" className={cn(buttonVariants(), 'h-10 gap-1.5')}>
            <Plus data-icon="inline-start" />
            Add booking
          </Link>
        }
      />

      {showCreated ? (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
          <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" />
          <p className="min-w-0 flex-1">
            Booking <span className="font-mono font-semibold">{createdCode}</span> was added successfully.
          </p>
          <button
            type="button"
            className="rounded-md p-1 text-emerald-800/50 hover:bg-emerald-100 hover:text-emerald-900"
            aria-label="Dismiss"
            onClick={() => setDismissCreated(true)}
          >
            <X className="size-3.5" />
          </button>
        </div>
      ) : null}

      <Surface className="mb-4 p-3 sm:p-4">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-2">
              <SoftLabel>Filter</SoftLabel>
              <SegmentedControl>
                <Segment
                  active={quick === 'all' && !hasRange && !isSearching}
                  onClick={() => clearFilters()}
                >
                  Recent
                </Segment>
                <Segment active={quick === 'today'} onClick={applyToday}>
                  Today
                </Segment>
              </SegmentedControl>

              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className={cn(
                        'h-10 justify-start gap-2 rounded-xl font-normal',
                        hasRange && 'border-teal-700/40 bg-teal-50 text-teal-950',
                      )}
                    />
                  }
                >
                  <CalendarIcon className="size-4 text-teal-900/35" />
                  <span className="truncate">{rangeLabel}</span>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-2">
                  <Calendar
                    mode="range"
                    selected={range}
                    onSelect={applyRange}
                    defaultMonth={range?.from ?? startOfToday()}
                    numberOfMonths={1}
                  />
                  {hasRange ? (
                    <div className="border-t border-teal-900/8 px-2 pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setRange(undefined)}
                      >
                        Clear range
                      </Button>
                    </div>
                  ) : null}
                </PopoverContent>
              </Popover>

              {hasActiveFilter ? (
                <Button type="button" variant="ghost" size="sm" className="gap-1" onClick={clearFilters}>
                  <X className="size-3.5" />
                  Clear
                </Button>
              ) : null}
            </div>

            <p className="text-sm text-teal-900/50">
              {list.length === 0
                ? '0 bookings'
                : `${showingFrom}–${showingTo} of ${list.length}`}
              {capped && filtered.length > RECENT_LIMIT
                ? ` · latest ${RECENT_LIMIT}`
                : null}
              {isSearching ? ` · search from ${formatShortDate(searchFrom)} onward` : null}
              {!isSearching && quick === 'today'
                ? ` · departing ${formatShortDate(today)}`
                : null}
              {!isSearching && hasRange ? ' · by trip date' : null}
            </p>
          </div>

          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-teal-900/35" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search agent, guest, or hotel…"
              className="h-10 rounded-xl pr-9 pl-9"
              aria-label="Search bookings by agent, guest, or hotel"
            />
            {isSearching ? (
              <button
                type="button"
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-teal-900/40 hover:bg-teal-950/5 hover:text-teal-950"
                aria-label="Clear search"
                onClick={() => setSearch('')}
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      </Surface>

      <Surface className="overflow-hidden">
        {list.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-teal-900/45">
            No bookings match this filter
            {isSearching ? ' (search covers last 7 days + upcoming only)' : ''}.
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableHead
                    column="code"
                    className="px-4"
                    active={sortKey === 'code'}
                    dir={sortDir}
                    onSort={toggleSort}
                  >
                    Booking Number
                  </SortableHead>
                  <TableHead className="text-teal-800/50">Date</TableHead>
                  <TableHead className="text-teal-800/50">Program</TableHead>
                  <SortableHead
                    column="agent"
                    active={sortKey === 'agent'}
                    dir={sortDir}
                    onSort={toggleSort}
                  >
                    Agent
                  </SortableHead>
                  <TableHead className="text-teal-800/50">Agent Ref</TableHead>
                  <TableHead className="text-teal-800/50">Lead Guest</TableHead>
                  <TableHead className="text-teal-800/50">Total Pax</TableHead>
                  <SortableHead
                    column="zone"
                    active={sortKey === 'zone'}
                    dir={sortDir}
                    onSort={toggleSort}
                  >
                    Pickup
                  </SortableHead>
                  <TableHead className="text-teal-800/50">Status</TableHead>
                  <TableHead className="px-4 text-right text-teal-800/50">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((booking) => (
                  <TableRow
                    key={booking.code}
                    className={cn(
                      createdCode === booking.code && 'bg-emerald-50/70',
                      booking.status === 'Cancelled' && 'bg-rose-50/70 text-rose-900/80',
                    )}
                  >
                    <TableCell
                      className={cn(
                        'px-4 font-mono text-[13px] font-medium',
                        booking.status === 'Cancelled' && 'text-rose-800 line-through decoration-rose-300',
                      )}
                    >
                      {booking.code}
                    </TableCell>
                    <TableCell>{formatShortDate(booking.date)}</TableCell>
                    <TableCell>{booking.program}</TableCell>
                    <TableCell>{booking.agentName}</TableCell>
                    <TableCell className="font-mono text-[13px] text-teal-900/70">
                      {booking.agentRef?.trim() ? booking.agentRef : '—'}
                    </TableCell>
                    <TableCell>{booking.leadGuest}</TableCell>
                    <TableCell>{totalPassengers(booking)}</TableCell>
                    <TableCell>
                      {booking.pickupZone} · {booking.pickupTime}
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={booking.status} />
                    </TableCell>
                    <TableCell className="px-4 text-right">
                      {booking.status !== 'Cancelled' ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-rose-700 hover:bg-rose-50 hover:text-rose-900"
                          onClick={() => handleCancel(booking.code)}
                        >
                          Cancel
                        </Button>
                      ) : (
                        <span className="text-xs font-medium text-rose-700/70">Cancelled</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPages > 1 ? (
              <div className="flex items-center justify-between gap-3 border-t border-teal-900/8 px-4 py-3">
                <p className="text-sm text-teal-900/50">
                  Page {safePage} of {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1 rounded-xl"
                    disabled={safePage <= 1}
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                  >
                    <ChevronLeft className="size-3.5" />
                    Prev
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1 rounded-xl"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                  >
                    Next
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        )}
      </Surface>
    </div>
  )
}
