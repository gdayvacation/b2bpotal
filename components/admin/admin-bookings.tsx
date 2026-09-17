'use client'

import { useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { CalendarIcon, Check, Plus, X } from 'lucide-react'
import type { DateRange } from 'react-day-picker'
import { usePortal } from '@/components/portal-provider'
import { StatusBadge } from '@/components/status-badge'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { formatShortDate, toISODate } from '@/lib/format'
import { totalPassengers } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Prototype “today” — matches dashboard seed data. */
const TODAY = '2026-09-17'
const TODAY_DATE = new Date(2026, 8, 17)

type QuickFilter = 'all' | 'today'

export function AdminBookings() {
  const { bookings } = usePortal()
  const searchParams = useSearchParams()
  const createdCode = searchParams.get('created')
  const [quick, setQuick] = useState<QuickFilter>('all')
  const [range, setRange] = useState<DateRange | undefined>()
  const [dismissCreated, setDismissCreated] = useState(false)

  const filtered = useMemo(() => {
    const fromIso = range?.from ? toISODate(range.from) : null
    const toIso = range?.to ? toISODate(range.to) : fromIso

    return bookings
      .filter((booking) => {
        if (quick === 'today' && booking.date !== TODAY) return false
        if (fromIso && booking.date < fromIso) return false
        if (toIso && booking.date > toIso) return false
        return true
      })
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))
  }, [bookings, quick, range])

  const hasRange = Boolean(range?.from)
  const hasActiveFilter = quick === 'today' || hasRange

  function clearFilters() {
    setQuick('all')
    setRange(undefined)
  }

  function applyToday() {
    setQuick('today')
    setRange(undefined)
  }

  function applyRange(next: DateRange | undefined) {
    setRange(next)
    if (next?.from) setQuick('all')
  }

  const rangeLabel = (() => {
    if (!range?.from) return 'Trip date range'
    const from = formatShortDate(toISODate(range.from))
    if (!range.to || toISODate(range.from) === toISODate(range.to)) return from
    return `${from} – ${formatShortDate(toISODate(range.to))}`
  })()

  const showCreated = Boolean(createdCode) && !dismissCreated

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Bookings"
        description="Every partner reservation in this prototype — including offline bookings added by admin."
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
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tracking-wide text-teal-700/55 uppercase">
              Filter
            </span>
            <div className="flex gap-1 rounded-lg border border-teal-900/8 bg-teal-50/40 p-1">
              <FilterChip active={quick === 'all' && !hasRange} onClick={() => clearFilters()}>
                All
              </FilterChip>
              <FilterChip active={quick === 'today'} onClick={applyToday}>
                Today
              </FilterChip>
            </div>

            <Popover>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className={cn(
                      'h-9 justify-start gap-2 font-normal',
                      hasRange && 'border-teal-700/40 bg-teal-50 text-teal-950',
                    )}
                  />
                }
              >
                <CalendarIcon className="size-4 text-neutral-400" />
                <span className="truncate">{rangeLabel}</span>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-2">
                <Calendar
                  mode="range"
                  selected={range}
                  onSelect={applyRange}
                  defaultMonth={range?.from ?? TODAY_DATE}
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
            {filtered.length} booking{filtered.length === 1 ? '' : 's'}
            {quick === 'today' ? ` · departing ${formatShortDate(TODAY)}` : null}
            {hasRange ? ' · by trip date' : null}
          </p>
        </div>
      </Surface>

      <Surface className="overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-neutral-500">
            No bookings match this filter.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="px-4 text-neutral-400">Booking Number</TableHead>
                <TableHead className="text-neutral-400">Date</TableHead>
                <TableHead className="text-neutral-400">Program</TableHead>
                <TableHead className="text-neutral-400">Agent</TableHead>
                <TableHead className="text-neutral-400">Agent Ref</TableHead>
                <TableHead className="text-neutral-400">Lead Guest</TableHead>
                <TableHead className="text-neutral-400">Total Pax</TableHead>
                <TableHead className="text-neutral-400">Pickup</TableHead>
                <TableHead className="text-neutral-400">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((booking) => (
                <TableRow
                  key={booking.code}
                  className={cn(createdCode === booking.code && 'bg-emerald-50/70')}
                >
                  <TableCell className="px-4 font-mono text-[13px] font-medium">
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
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Surface>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
        active
          ? 'bg-teal-900 text-white shadow-sm'
          : 'text-teal-900/60 hover:bg-white hover:text-teal-950',
      )}
    >
      {children}
    </button>
  )
}
