'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { CalendarDays, ChevronDown, History, Pencil, X } from 'lucide-react'
import { BookingHistoryDialog } from '@/components/booking-history-dialog'
import { ChangeBookingDateDialog } from '@/components/change-booking-date-dialog'
import { EditBookingDialog } from '@/components/edit-booking-dialog'
import { usePortal } from '@/components/portal-provider'
import { StatusBadge } from '@/components/status-badge'
import {
  EmptyState,
  PageHeader,
  Segment,
  SegmentedControl,
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
import { VoucherShareActions } from '@/components/voucher-share-actions'
import { formatShortDate, toISODate, todayISO } from '@/lib/format'
import {
  totalPassengers,
  type Booking,
  type BookingActor,
  type Program,
} from '@/lib/types'
import { cn } from '@/lib/utils'

type ProgramFilter = 'all' | Program

function AgentStatusMenu({
  booking,
  onCancel,
  onChangeDate,
  onRebook,
  onEdit,
  onHistory,
}: {
  booking: Booking
  onCancel: (code: string, travelDate: string, program: Booking['program']) => void
  onChangeDate: (booking: Booking) => void
  onRebook: (booking: Booking) => void
  onEdit: (booking: Booking) => void
  onHistory: (booking: Booking) => void
}) {
  const { isCancelOpen, isProgramClosed } = usePortal()
  const [open, setOpen] = useState(false)
  const cancelled = booking.status === 'Cancelled'
  const closedByAdmin = isProgramClosed(booking.date, booking.program)
  const canEdit = !cancelled && isCancelOpen(booking.date) && !closedByAdmin
  const lockedReason = cancelled
    ? null
    : closedByAdmin
      ? 'Closed by admin for this date'
      : !isCancelOpen(booking.date)
        ? 'Changes closed (cutoff)'
        : null

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-teal-700/25"
            aria-label={`Manage booking ${booking.code}`}
          />
        }
      >
        <StatusBadge status={booking.status} />
        <ChevronDown className="size-3.5 text-teal-800/45" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 gap-1 p-1.5">
        {cancelled ? (
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-teal-950 hover:bg-teal-50"
            onClick={() => {
              setOpen(false)
              onRebook(booking)
            }}
          >
            <CalendarDays className="size-3.5 text-teal-800/50" />
            Rebook
          </button>
        ) : canEdit ? (
          <>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-teal-950 hover:bg-teal-50"
              onClick={() => {
                setOpen(false)
                onEdit(booking)
              }}
            >
              <Pencil className="size-3.5 text-teal-800/50" />
              Edit details
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-teal-950 hover:bg-teal-50"
              onClick={() => {
                setOpen(false)
                onChangeDate(booking)
              }}
            >
              <CalendarDays className="size-3.5 text-teal-800/50" />
              Change date
            </button>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
              onClick={() => {
                setOpen(false)
                onCancel(booking.code, booking.date, booking.program)
              }}
            >
              Cancel booking
            </button>
          </>
        ) : (
          <p className="px-2.5 py-2 text-xs text-teal-900/45">{lockedReason}</p>
        )}
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-teal-950 hover:bg-teal-50"
          onClick={() => {
            setOpen(false)
            onHistory(booking)
          }}
        >
          <History className="size-3.5 text-teal-800/50" />
          History
        </button>
      </PopoverContent>
    </Popover>
  )
}

export function BookingsTable({
  bookings,
  slug,
  showAgent = false,
}: {
  bookings: Booking[]
  slug?: string
  showAgent?: boolean
}) {
  const { agents, cancelBooking, isCancelOpen, isProgramClosed } = usePortal()
  const [dateTarget, setDateTarget] = useState<Booking | null>(null)
  const [rebookTarget, setRebookTarget] = useState<Booking | null>(null)
  const [editTarget, setEditTarget] = useState<Booking | null>(null)
  const [historyTarget, setHistoryTarget] = useState<Booking | null>(null)
  const [dayFilter, setDayFilter] = useState<string | null>(() => todayISO())
  const [programFilter, setProgramFilter] = useState<ProgramFilter>('all')
  const [calendarOpen, setCalendarOpen] = useState(false)

  const actor: BookingActor | undefined = useMemo(() => {
    if (!slug) return undefined
    const agent = agents.find((item) => item.slug === slug)
    return {
      role: 'agent',
      name: agent?.name ?? slug,
      slug,
    }
  }, [agents, slug])

  const nearbyDays = useMemo(() => {
    const centerIso = dayFilter ?? todayISO()
    const center = new Date(`${centerIso}T12:00:00`)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(center)
      date.setDate(center.getDate() + (index - 3))
      return toISODate(date)
    })
  }, [dayFilter])

  const filtered = useMemo(() => {
    return bookings
      .filter((booking) => {
        if (dayFilter && booking.date !== dayFilter) return false
        if (programFilter !== 'all' && booking.program !== programFilter) return false
        return true
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))
  }, [bookings, dayFilter, programFilter])

  const today = todayISO()
  const filtersActive = dayFilter !== today || programFilter !== 'all'
  const dayFilterObj = dayFilter ? new Date(`${dayFilter}T12:00:00`) : undefined

  function handleCancel(code: string, travelDate: string, program: Booking['program']) {
    if (isProgramClosed(travelDate, program)) {
      window.alert('Booking closed by admin for this date.')
      return
    }
    if (!isCancelOpen(travelDate)) {
      window.alert('Cancel is closed for this travel date.')
      return
    }
    if (
      !window.confirm(
        `Cancel booking ${code}? Seats on that departure will become available again.`,
      )
    ) {
      return
    }
    const result = cancelBooking(code, { actor })
    if (!result.ok) window.alert(result.error)
  }

  function selectDay(date: Date | undefined) {
    if (!date) return
    setDayFilter(toISODate(date))
    setCalendarOpen(false)
  }

  function clearFilters() {
    setDayFilter(todayISO())
    setProgramFilter('all')
  }

  return (
    <>
      <PageHeader
        title="My Bookings"
        description="Confirmed, pending, and cancelled bookings for this agency. Filter by day and program to review departure details."
      />

      <Surface className="mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
            <div className="space-y-1.5">
              <p className="text-xs font-semibold tracking-[0.12em] text-teal-700/55 uppercase">
                Day
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        type="button"
                        variant="outline"
                        className="h-10 min-w-[10.5rem] justify-start gap-2 rounded-xl border-teal-900/12 bg-white/80 font-normal"
                      />
                    }
                  >
                    <CalendarDays className="size-4 text-teal-800/45" />
                    <span>{dayFilter ? formatShortDate(dayFilter) : 'All days'}</span>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-auto p-2">
                    <Calendar
                      mode="single"
                      selected={dayFilterObj}
                      onSelect={selectDay}
                      defaultMonth={dayFilterObj ?? new Date(`${today}T12:00:00`)}
                    />
                    <div className="mt-1 flex flex-col gap-0.5">
                      {dayFilter !== today ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setDayFilter(today)
                            setCalendarOpen(false)
                          }}
                        >
                          Today
                        </Button>
                      ) : null}
                      {dayFilter !== null ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => {
                            setDayFilter(null)
                            setCalendarOpen(false)
                          }}
                        >
                          Show all days
                        </Button>
                      ) : null}
                    </div>
                  </PopoverContent>
                </Popover>
                <div className="flex max-w-full flex-wrap gap-1.5">
                  {nearbyDays.map((date) => (
                    <button
                      key={date}
                      type="button"
                      onClick={() => setDayFilter(date)}
                      className={cn(
                        'rounded-full px-2.5 py-1 text-xs font-medium transition-colors',
                        dayFilter === date
                          ? 'bg-teal-800 text-white'
                          : 'bg-teal-950/[0.05] text-teal-900/65 hover:bg-teal-950/[0.09]',
                      )}
                    >
                      {formatShortDate(date)}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="text-xs font-semibold tracking-[0.12em] text-teal-700/55 uppercase">
                Program
              </p>
              <SegmentedControl>
                <Segment active={programFilter === 'all'} onClick={() => setProgramFilter('all')}>
                  All
                </Segment>
                <Segment active={programFilter === 'PP'} onClick={() => setProgramFilter('PP')}>
                  PP
                </Segment>
                <Segment
                  active={programFilter === 'James Bond'}
                  onClick={() => setProgramFilter('James Bond')}
                >
                  James Bond
                </Segment>
              </SegmentedControl>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-teal-900/55">
              {filtered.length} booking{filtered.length === 1 ? '' : 's'}
              {filtersActive ? ' matching filters' : ''}
            </p>
            {filtersActive ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1.5"
                onClick={clearFilters}
              >
                <X className="size-3.5" />
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </Surface>

      <div className="space-y-3 md:hidden">
        {filtered.length === 0 ? (
          <Surface>
            <EmptyState>
              {bookings.length === 0
                ? 'No bookings yet.'
                : 'No bookings match these filters.'}
            </EmptyState>
          </Surface>
        ) : (
          filtered.map((booking) => {
            const canEdit =
              booking.status !== 'Cancelled' &&
              isCancelOpen(booking.date) &&
              !isProgramClosed(booking.date, booking.program)
            const lockedReason = isProgramClosed(booking.date, booking.program)
              ? 'Closed by admin for this date'
              : 'Changes closed (cutoff)'
            return (
              <Surface
                key={booking.code}
                className={cn(
                  'p-4',
                  booking.status === 'Cancelled' && 'border-rose-200/80 bg-rose-50/50',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {slug ? (
                      <Link
                        href={`/agent/${slug}/voucher/${booking.code}`}
                        className={cn(
                          'font-mono text-sm font-semibold hover:underline',
                          booking.status === 'Cancelled'
                            ? 'text-rose-800 line-through decoration-rose-300'
                            : 'text-teal-900',
                        )}
                      >
                        {booking.code}
                      </Link>
                    ) : (
                      <p
                        className={cn(
                          'font-mono text-sm font-semibold',
                          booking.status === 'Cancelled'
                            ? 'text-rose-800 line-through decoration-rose-300'
                            : 'text-teal-950',
                        )}
                      >
                        {booking.code}
                      </p>
                    )}
                    <p className="mt-1 text-sm text-teal-950/55">
                      {formatShortDate(booking.date)} · {booking.program}
                    </p>
                  </div>
                  <StatusBadge status={booking.status} />
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="gday-soft-label">Guest name</p>
                    <p className="mt-0.5 font-semibold text-teal-950">{booking.leadGuest}</p>
                  </div>
                  <div>
                    <p className="gday-soft-label">Pax</p>
                    <p className="mt-0.5 font-semibold text-teal-950">{totalPassengers(booking)}</p>
                  </div>
                  {showAgent ? (
                    <div className="col-span-2">
                      <p className="gday-soft-label">Agent</p>
                      <p className="mt-0.5 font-semibold text-teal-950">{booking.agentName}</p>
                    </div>
                  ) : null}
                  <div className="col-span-2">
                    <p className="gday-soft-label">Pickup</p>
                    <p className="mt-0.5 font-semibold text-teal-950">
                      {booking.pickupZone}
                      {booking.pickupTime ? ` · ${booking.pickupTime}` : ''}
                    </p>
                  </div>
                  {booking.note.trim() ? (
                    <div className="col-span-2">
                      <p className="gday-soft-label">Note</p>
                      <p className="mt-0.5 font-semibold whitespace-pre-wrap text-teal-950">
                        {booking.note}
                      </p>
                    </div>
                  ) : null}
                  {booking.cashOnTour.trim() ? (
                    <div className="col-span-2">
                      <p className="gday-soft-label">Cash on tour</p>
                      <p className="mt-0.5 font-semibold text-teal-950">{booking.cashOnTour}</p>
                    </div>
                  ) : null}
                </div>
                {slug ? (
                  <VoucherShareActions
                    slug={slug}
                    code={booking.code}
                    guestName={booking.leadGuest}
                    size="sm"
                    className="mt-4"
                  />
                ) : null}
                {booking.status !== 'Cancelled' ? (
                  canEdit ? (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => setEditTarget(booking)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => setDateTarget(booking)}
                      >
                        Change date
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9"
                        onClick={() => setHistoryTarget(booking)}
                      >
                        History
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-900"
                        onClick={() => handleCancel(booking.code, booking.date, booking.program)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-col gap-2">
                      <p className="text-center text-xs font-medium text-teal-900/45">
                        {lockedReason}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 w-full"
                        onClick={() => setHistoryTarget(booking)}
                      >
                        History
                      </Button>
                    </div>
                  )
                ) : (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setRebookTarget(booking)}
                    >
                      Rebook
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => setHistoryTarget(booking)}
                    >
                      History
                    </Button>
                  </div>
                )}
              </Surface>
            )
          })
        )}
      </div>

      <Surface className="hidden overflow-x-auto md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="px-4 text-teal-800/50">Booking Number</TableHead>
              <TableHead className="text-teal-800/50">Date</TableHead>
              <TableHead className="text-teal-800/50">Program</TableHead>
              {showAgent ? <TableHead className="text-teal-800/50">Agent</TableHead> : null}
              <TableHead className="text-teal-800/50">Guest Name</TableHead>
              <TableHead className="text-teal-800/50">Total Pax</TableHead>
              <TableHead className="text-teal-800/50">Pickup</TableHead>
              <TableHead className="text-teal-800/50">Note</TableHead>
              <TableHead className="text-teal-800/50">COT</TableHead>
              <TableHead className="text-teal-800/50">Voucher</TableHead>
              <TableHead className="px-4 text-teal-800/50">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={showAgent ? 11 : 10}
                  className="px-4 py-10 text-center text-teal-900/50"
                >
                  {bookings.length === 0
                    ? 'No bookings yet.'
                    : 'No bookings match these filters.'}
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((booking) => (
                <TableRow
                  key={booking.code}
                  className={cn(
                    'hover:bg-teal-950/[0.02]',
                    booking.status === 'Cancelled' && 'bg-rose-50/70 text-rose-900/80',
                  )}
                >
                  <TableCell
                    className={cn(
                      'px-4 font-mono text-[13px] font-medium',
                      booking.status === 'Cancelled' &&
                        'text-rose-800 line-through decoration-rose-300',
                    )}
                  >
                    {slug ? (
                      <Link
                        href={`/agent/${slug}/voucher/${booking.code}`}
                        className="hover:underline"
                      >
                        {booking.code}
                      </Link>
                    ) : (
                      booking.code
                    )}
                  </TableCell>
                  <TableCell>{formatShortDate(booking.date)}</TableCell>
                  <TableCell>{booking.program}</TableCell>
                  {showAgent ? <TableCell>{booking.agentName}</TableCell> : null}
                  <TableCell className="font-medium">{booking.leadGuest}</TableCell>
                  <TableCell>{totalPassengers(booking)}</TableCell>
                  <TableCell>
                    {booking.pickupZone}
                    {booking.pickupTime ? ` · ${booking.pickupTime}` : ''}
                  </TableCell>
                  <TableCell className="max-w-[10rem] truncate" title={booking.note || undefined}>
                    {booking.note.trim() || '—'}
                  </TableCell>
                  <TableCell
                    className="max-w-[8rem] truncate"
                    title={booking.cashOnTour || undefined}
                  >
                    {booking.cashOnTour.trim() || '—'}
                  </TableCell>
                  <TableCell>
                    {slug ? (
                      <VoucherShareActions
                        slug={slug}
                        code={booking.code}
                        guestName={booking.leadGuest}
                        size="sm"
                      />
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell className="px-4">
                    <AgentStatusMenu
                      booking={booking}
                      onCancel={handleCancel}
                      onChangeDate={setDateTarget}
                      onRebook={setRebookTarget}
                      onEdit={setEditTarget}
                      onHistory={setHistoryTarget}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Surface>

      <ChangeBookingDateDialog
        booking={dateTarget}
        open={dateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDateTarget(null)
        }}
        actor={actor}
      />

      <ChangeBookingDateDialog
        booking={rebookTarget}
        open={rebookTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRebookTarget(null)
        }}
        mode="rebook"
        actor={actor}
      />

      <EditBookingDialog
        booking={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        actor={actor}
      />

      <BookingHistoryDialog
        booking={historyTarget}
        open={historyTarget !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryTarget(null)
        }}
      />
    </>
  )
}
