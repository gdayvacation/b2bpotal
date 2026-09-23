'use client'

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CalendarDays, ChevronDown, History, Pencil, Search, X } from 'lucide-react'
import {
  AmendmentPolicyNotice,
  LateCancelNotice,
} from '@/components/amendment-policy-notice'
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
import { VoucherPreview } from '@/components/agent/voucher-view'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { formatIncludeLabel, formatShortDate, startOfToday, toISODate } from '@/lib/format'
import { usePortalTodayISO } from '@/lib/use-portal-today'
import {
  totalPassengers,
  type Booking,
  type BookingActor,
  type Program,
} from '@/lib/types'
import { cn } from '@/lib/utils'

type ProgramFilter = 'all' | Program

/** Search looks back 30 days and through all future trips (keeps lists fast). */
const SEARCH_HISTORY_DAYS = 30

function searchFromISO() {
  const d = startOfToday()
  d.setDate(d.getDate() - SEARCH_HISTORY_DAYS)
  return toISODate(d)
}

function AgentStatusMenu({
  booking,
  onCancel,
  onChangeDate,
  onRebook,
  onEdit,
  onHistory,
}: {
  booking: Booking
  onCancel: (booking: Booking) => void
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
                onCancel(booking)
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
  const { agents, bookingCutoffs, cancelBooking, isCancelOpen, isLateAmendment, isProgramClosed } =
    usePortal()
  const [dateTarget, setDateTarget] = useState<Booking | null>(null)
  const [rebookTarget, setRebookTarget] = useState<Booking | null>(null)
  const [editTarget, setEditTarget] = useState<Booking | null>(null)
  const [historyTarget, setHistoryTarget] = useState<Booking | null>(null)
  const [voucherTarget, setVoucherTarget] = useState<Booking | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
  const [cancelError, setCancelError] = useState('')
  const portalToday = usePortalTodayISO()
  const prevTodayRef = useRef(portalToday)
  const [dayFilter, setDayFilter] = useState<string | null>(() => portalToday)
  const [programFilter, setProgramFilter] = useState<ProgramFilter>('all')
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (portalToday === prevTodayRef.current) return
    const previousToday = prevTodayRef.current
    prevTodayRef.current = portalToday
    setDayFilter((current) => (current === previousToday ? portalToday : current))
  }, [portalToday])

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
    const centerIso = dayFilter ?? portalToday
    const center = new Date(`${centerIso}T12:00:00`)
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(center)
      date.setDate(center.getDate() + (index - 3))
      return toISODate(date)
    })
  }, [dayFilter, portalToday])

  const query = search.trim().toLowerCase()
  const isSearching = query.length > 0
  const searchFrom = searchFromISO()

  const filtered = useMemo(() => {
    return bookings
      .filter((booking) => {
        if (programFilter !== 'all' && booking.program !== programFilter) return false
        if (isSearching) {
          if (booking.date < searchFrom) return false
          const haystack = [
            booking.agentRef,
            booking.code,
            booking.leadGuest,
            booking.pickupHotel,
          ]
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(query)) return false
          return true
        }
        if (dayFilter && booking.date !== dayFilter) return false
        return true
      })
      .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))
  }, [bookings, dayFilter, programFilter, isSearching, query, searchFrom])

  const today = portalToday
  const filtersActive = isSearching || dayFilter !== today || programFilter !== 'all'
  const dayFilterObj = dayFilter ? new Date(`${dayFilter}T12:00:00`) : undefined
  const showCanoe = programFilter !== 'PP'
  const columnCount = (showAgent ? 11 : 10) + (showCanoe ? 1 : 0)

  function requestCancel(booking: Booking) {
    if (isProgramClosed(booking.date, booking.program)) {
      window.alert('Booking closed by admin for this date.')
      return
    }
    if (!isCancelOpen(booking.date)) {
      window.alert('Cancel is closed for this travel date.')
      return
    }
    setCancelError('')
    setCancelTarget(booking)
  }

  function confirmCancel() {
    if (!cancelTarget) return
    const result = cancelBooking(cancelTarget.code, { actor })
    if (!result.ok) {
      setCancelError(result.error)
      return
    }
    setCancelTarget(null)
  }

  function selectDay(date: Date | undefined) {
    if (!date) return
    setSearch('')
    setDayFilter(toISODate(date))
    setCalendarOpen(false)
  }

  function clearFilters() {
    setDayFilter(portalToday)
    setProgramFilter('all')
    setSearch('')
  }

  return (
    <>
      <PageHeader
        title="My Bookings"
        description="Confirmed, pending, and cancelled bookings for this agency. Search by VC No., booking code, guest name, or hotel, or filter by day and program."
      />

      <Surface className="mb-4 p-4 sm:p-5">
        <div className="flex flex-col gap-4">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-teal-900/35" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search VC No., booking code, guest, or hotel…"
              className="h-10 rounded-xl pr-9 pl-9"
              aria-label="Search bookings by VC No., booking code, guest name, or hotel"
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
                      <span>
                        {isSearching
                          ? 'All matching days'
                          : dayFilter
                            ? formatShortDate(dayFilter)
                            : 'All days'}
                      </span>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-auto p-2">
                      <Calendar
                        mode="single"
                        selected={isSearching ? undefined : dayFilterObj}
                        onSelect={selectDay}
                        defaultMonth={dayFilterObj ?? new Date(`${today}T12:00:00`)}
                      />
                      <div className="mt-1 flex flex-col gap-0.5">
                        {dayFilter !== today || isSearching ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setSearch('')
                              setDayFilter(today)
                              setCalendarOpen(false)
                            }}
                          >
                            Today
                          </Button>
                        ) : null}
                        {dayFilter !== null || isSearching ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="w-full"
                            onClick={() => {
                              setSearch('')
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
                  {!isSearching ? (
                    <div className="flex max-w-full flex-wrap gap-1.5">
                      {nearbyDays.map((date) => (
                        <button
                          key={date}
                          type="button"
                          onClick={() => {
                            setSearch('')
                            setDayFilter(date)
                          }}
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
                  ) : null}
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-semibold tracking-[0.12em] text-teal-700/55 uppercase">
                  Program
                </p>
                <SegmentedControl>
                  <Segment
                    active={programFilter === 'all'}
                    onClick={() => setProgramFilter('all')}
                  >
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
                {isSearching
                  ? ` · search from ${formatShortDate(searchFrom)} onward`
                  : filtersActive
                    ? ' matching filters'
                    : ''}
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
        </div>
      </Surface>

      <div className="space-y-3 md:hidden">
        {filtered.length === 0 ? (
          <Surface>
            <EmptyState>
              {bookings.length === 0
                ? 'No bookings yet.'
                : isSearching
                  ? 'No bookings match this search (last 30 days + future).'
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
                      <OpenVoucherButton
                        booking={booking}
                        onOpen={setVoucherTarget}
                        className="text-sm font-semibold"
                      >
                        {booking.code}
                      </OpenVoucherButton>
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
                    <p className="mt-0.5 text-xs text-teal-900/55">{paxDetail(booking)}</p>
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
                  <div>
                    <p className="gday-soft-label">Park fee</p>
                    <p className="mt-0.5 font-semibold text-teal-950">
                      {formatIncludeLabel(booking.parkFee)}
                    </p>
                  </div>
                  {booking.program === 'James Bond' ? (
                    <div>
                      <p className="gday-soft-label">Canoe</p>
                      <p className="mt-0.5 font-semibold text-teal-950">
                        {formatIncludeLabel(booking.canoe)}
                      </p>
                    </div>
                  ) : null}
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
                        onClick={() => requestCancel(booking)}
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
              <TableHead className="w-px whitespace-normal px-2 leading-tight text-teal-800/50">
                Booking Number
              </TableHead>
              <TableHead className="w-px text-teal-800/50">VC No.</TableHead>
              {showAgent ? <TableHead className="text-teal-800/50">Agent</TableHead> : null}
              <TableHead className="text-teal-800/50">Guest Name</TableHead>
              <TableHead className="text-teal-800/50">Total Pax</TableHead>
              <TableHead className="text-teal-800/50">Hotel Name</TableHead>
              <TableHead className="w-px text-teal-800/50">Pickup</TableHead>
              <TableHead className="text-teal-800/50">Park fee</TableHead>
              {showCanoe ? <TableHead className="text-teal-800/50">Canoe</TableHead> : null}
              <TableHead className="text-teal-800/50">COT</TableHead>
              <TableHead className="min-w-[18rem] text-teal-800/50">Note</TableHead>
              <TableHead className="px-4 text-teal-800/50">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="px-4 py-10 text-center text-teal-900/50"
                >
                  {bookings.length === 0
                    ? 'No bookings yet.'
                    : isSearching
                      ? 'No bookings match this search (last 30 days + future).'
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
                      'w-px px-2 font-mono text-[13px] font-medium',
                      booking.status === 'Cancelled' &&
                        'text-rose-800 line-through decoration-rose-300',
                    )}
                  >
                    {slug ? (
                      <OpenVoucherButton booking={booking} onOpen={setVoucherTarget}>
                        {booking.code}
                      </OpenVoucherButton>
                    ) : (
                      booking.code
                    )}
                  </TableCell>
                  <TableCell className="w-px font-mono text-[13px]">
                    {slug ? (
                      <OpenVoucherButton booking={booking} onOpen={setVoucherTarget}>
                        {booking.agentRef.trim() || '—'}
                      </OpenVoucherButton>
                    ) : (
                      booking.agentRef.trim() || '—'
                    )}
                  </TableCell>
                  {showAgent ? <TableCell>{booking.agentName}</TableCell> : null}
                  <TableCell className="font-medium">
                    {slug ? (
                      <OpenVoucherButton
                        booking={booking}
                        onOpen={setVoucherTarget}
                        className="font-sans"
                      >
                        {booking.leadGuest}
                      </OpenVoucherButton>
                    ) : (
                      booking.leadGuest
                    )}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <p className="font-medium tabular-nums">{totalPassengers(booking)}</p>
                    <p className="mt-0.5 text-[11px] leading-snug text-teal-900/55 tabular-nums">
                      {paxDetail(booking)}
                    </p>
                  </TableCell>
                  <TableCell>{booking.pickupHotel.trim() || '—'}</TableCell>
                  <TableCell className="w-px whitespace-nowrap">
                    {booking.pickupZone}
                    {booking.pickupTime ? ` · ${booking.pickupTime}` : ''}
                  </TableCell>
                  <TableCell>{formatIncludeLabel(booking.parkFee)}</TableCell>
                  {showCanoe ? (
                    <TableCell>
                      {booking.program === 'James Bond' ? formatIncludeLabel(booking.canoe) : '—'}
                    </TableCell>
                  ) : null}
                  <TableCell
                    className="max-w-[8rem] truncate"
                    title={booking.cashOnTour || undefined}
                  >
                    {booking.cashOnTour.trim() || '—'}
                  </TableCell>
                  <TableCell className="min-w-[18rem] whitespace-normal" title={booking.note || undefined}>
                    <p className="whitespace-pre-wrap break-words">{booking.note.trim() || '—'}</p>
                  </TableCell>
                  <TableCell className="px-4">
                    <AgentStatusMenu
                      booking={booking}
                      onCancel={requestCancel}
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

      <Dialog
        open={voucherTarget !== null}
        onOpenChange={(open) => {
          if (!open) setVoucherTarget(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="sr-only">Voucher confirmation</DialogTitle>
          {voucherTarget && slug ? (
            <VoucherPreview booking={voucherTarget} slug={slug} embedded />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={cancelTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelTarget(null)
            setCancelError('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel booking</DialogTitle>
            <DialogDescription>
              {cancelTarget
                ? `${cancelTarget.code} · ${formatShortDate(cancelTarget.date)} · ${totalPassengers(cancelTarget)} pax. Seats on that departure will become available again.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {cancelTarget && isLateAmendment(cancelTarget.date) ? (
            <LateCancelNotice settings={bookingCutoffs} />
          ) : cancelTarget ? (
            <AmendmentPolicyNotice settings={bookingCutoffs} variant="compact" />
          ) : null}
          {cancelError ? <p className="text-sm text-red-600">{cancelError}</p> : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCancelTarget(null)
                setCancelError('')
              }}
            >
              Keep booking
            </Button>
            <Button type="button" variant="destructive" onClick={confirmCancel}>
              {cancelTarget && isLateAmendment(cancelTarget.date)
                ? 'Cancel — charge full price'
                : 'Cancel booking'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

function OpenVoucherButton({
  booking,
  onOpen,
  className,
  children,
}: {
  booking: Booking
  onOpen: (booking: Booking) => void
  className?: string
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(booking)}
      className={cn(
        'text-left font-mono text-[13px] font-medium hover:underline',
        booking.status === 'Cancelled' && 'text-rose-800 line-through decoration-rose-300',
        className,
      )}
    >
      {children}
    </button>
  )
}

function paxDetail(booking: Pick<Booking, 'adults' | 'children' | 'infants' | 'tourLeaders'>) {
  return `${booking.adults} AD · ${booking.children} CH · ${booking.infants} INF · ${booking.tourLeaders} TL`
}
