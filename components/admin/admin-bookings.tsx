'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  CalendarIcon,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  History,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react'
import { BookingHistoryDialog } from '@/components/booking-history-dialog'
import { ChangeBookingDateDialog } from '@/components/change-booking-date-dialog'
import { EditBookingDialog } from '@/components/edit-booking-dialog'
import { usePortal } from '@/components/portal-provider'
import { StatusBadge } from '@/components/status-badge'
import { PageHeader, Segment, SegmentedControl, SoftLabel, Surface } from '@/components/ui-primitives'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatShortDate, startOfToday, toISODate } from '@/lib/format'
import { usePortalTodayISO } from '@/lib/use-portal-today'
import { isNoTransfer, totalPassengers, type Booking, type Program } from '@/lib/types'
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
type ProgramFilter = 'all' | Program
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

function toTimeInputValue(pickupTime: string) {
  const match = pickupTime.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

function BookingPickupCell({
  booking,
  onSetPickup,
}: {
  booking: Booking
  onSetPickup: (booking: Booking) => void
}) {
  const cancelled = booking.status === 'Cancelled'
  const canEdit = !cancelled && !isNoTransfer(booking.pickupZone)
  const awaiting = booking.status === 'Pending Pickup Time'

  if (!canEdit) {
    return (
      <span>
        {booking.pickupZone} · {booking.pickupTime}
      </span>
    )
  }

  return (
    <button
      type="button"
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-md text-left transition-colors hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-700/25',
        awaiting && 'text-amber-800',
      )}
      onClick={() => onSetPickup(booking)}
      aria-label={
        awaiting
          ? `Add pickup time for ${booking.code}`
          : `Edit pickup time for ${booking.code}`
      }
    >
      <span className="truncate">
        {booking.pickupZone}
        {' · '}
        <span className={cn(awaiting && 'font-medium underline decoration-amber-400/80 underline-offset-2')}>
          {awaiting ? 'Add pickup time' : booking.pickupTime}
        </span>
      </span>
    </button>
  )
}

function BookingStatusMenu({
  booking,
  onCancel,
  onChangeDate,
  onRebook,
  onEdit,
  onHistory,
}: {
  booking: Booking
  onCancel: (code: string) => void
  onChangeDate: (booking: Booking) => void
  onRebook: (booking: Booking) => void
  onEdit: (booking: Booking) => void
  onHistory: (booking: Booking) => void
}) {
  const [open, setOpen] = useState(false)
  const cancelled = booking.status === 'Cancelled'

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-full outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-teal-700/25"
            aria-label={`Manage status for ${booking.code}`}
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
        ) : (
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
                onCancel(booking.code)
              }}
            >
              Cancel booking
            </button>
          </>
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

export function AdminBookings() {
  const { bookings, cancelBooking, setBookingPickupTime } = usePortal()
  const searchParams = useSearchParams()
  const createdCode = searchParams.get('created')
  const [quick, setQuick] = useState<QuickFilter>('all')
  const [program, setProgram] = useState<ProgramFilter>('all')
  const [selectedDate, setSelectedDate] = useState<Date | undefined>()
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [dismissCreated, setDismissCreated] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey | null>(null)
  const [sortDir, setSortDir] = useState<SortDir>('asc')
  const [pickupTarget, setPickupTarget] = useState<Booking | null>(null)
  const [pickupTime, setPickupTime] = useState('')
  const [pickupError, setPickupError] = useState('')
  const [dateTarget, setDateTarget] = useState<Booking | null>(null)
  const [rebookTarget, setRebookTarget] = useState<Booking | null>(null)
  const [editTarget, setEditTarget] = useState<Booking | null>(null)
  const [historyTarget, setHistoryTarget] = useState<Booking | null>(null)

  const adminActor = { role: 'admin' as const, name: 'Admin' }

  const query = search.trim().toLowerCase()
  const isSearching = query.length > 0
  const hasSelectedDate = Boolean(selectedDate)
  const hasActiveFilter = quick === 'today' || hasSelectedDate || isSearching || program !== 'all'
  const today = usePortalTodayISO()
  const searchFrom = searchFromISO()

  const filtered = useMemo(() => {
    const dateIso = selectedDate ? toISODate(selectedDate) : null
    const dir = sortDir === 'asc' ? 1 : -1

    return bookings
      .filter((booking) => {
        if (program !== 'all' && booking.program !== program) return false
        if (isSearching) {
          if (booking.date < searchFrom) return false
          const haystack = [
            booking.agentName,
            booking.leadGuest,
            booking.agentRef,
            booking.pickupHotel,
          ]
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(query)) return false
        }
        if (quick === 'today' && booking.date !== today) return false
        if (dateIso && booking.date !== dateIso) return false
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
  }, [bookings, program, quick, selectedDate, isSearching, query, sortKey, sortDir, today, searchFrom])

  const capped = !hasActiveFilter
  const list = capped ? filtered.slice(0, RECENT_LIMIT) : filtered
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageStart = (safePage - 1) * PAGE_SIZE
  const pageRows = list.slice(pageStart, pageStart + PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [quick, program, selectedDate, query, sortKey, sortDir])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  function clearFilters() {
    setQuick('all')
    setProgram('all')
    setSelectedDate(undefined)
    setSearch('')
  }

  function applyRecent() {
    setQuick('all')
    setSelectedDate(undefined)
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
    setSelectedDate(undefined)
  }

  function applySelectedDate(next: Date | undefined) {
    setSelectedDate(next)
    if (next) setQuick('all')
  }

  function handleCancel(code: string) {
    if (
      !window.confirm(
        `Cancel booking ${code}? Seats will free up on the departure date. This cannot be undone from here.`,
      )
    ) {
      return
    }
    cancelBooking(code, { bypassCutoff: true, actor: { role: 'admin', name: 'Admin' } })
  }

  function openPickupDialog(booking: Booking) {
    setPickupTarget(booking)
    setPickupTime(toTimeInputValue(booking.pickupTime))
    setPickupError('')
  }

  function handleSavePickup() {
    if (!pickupTarget) return
    const result = setBookingPickupTime(pickupTarget.code, pickupTime, {
      actor: { role: 'admin', name: 'Admin' },
    })
    if (!result.ok) {
      setPickupError(result.error)
      return
    }
    setPickupTarget(null)
    setPickupError('')
  }

  const dateLabel = selectedDate ? formatShortDate(toISODate(selectedDate)) : 'Trip date'

  const showCreated = Boolean(createdCode) && !dismissCreated
  const showingFrom = list.length === 0 ? 0 : pageStart + 1
  const showingTo = Math.min(pageStart + PAGE_SIZE, list.length)

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Booking"
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
                  active={quick === 'all' && !hasSelectedDate && !isSearching}
                  onClick={applyRecent}
                >
                  New Booking
                </Segment>
                <Segment active={quick === 'today'} onClick={applyToday}>
                  Travel today
                </Segment>
              </SegmentedControl>

              <SegmentedControl>
                <Segment active={program === 'all'} onClick={() => setProgram('all')}>
                  All
                </Segment>
                <Segment active={program === 'PP'} onClick={() => setProgram('PP')}>
                  PP
                </Segment>
                <Segment
                  active={program === 'James Bond'}
                  onClick={() => setProgram('James Bond')}
                >
                  JB
                </Segment>
              </SegmentedControl>

              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      variant="outline"
                      className={cn(
                        'h-10 justify-start gap-2 rounded-xl font-normal',
                        hasSelectedDate && 'border-teal-700/40 bg-teal-50 text-teal-950',
                      )}
                    />
                  }
                >
                  <CalendarIcon className="size-4 text-teal-900/35" />
                  <span className="truncate">{dateLabel}</span>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-auto p-2">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={applySelectedDate}
                    defaultMonth={selectedDate ?? startOfToday()}
                    numberOfMonths={1}
                  />
                  {hasSelectedDate ? (
                    <div className="border-t border-teal-900/8 px-2 pt-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full"
                        onClick={() => setSelectedDate(undefined)}
                      >
                        Clear date
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
              {!isSearching && hasSelectedDate ? ' · by trip date' : null}
              {program === 'PP' ? ' · PP only' : null}
              {program === 'James Bond' ? ' · JB only' : null}
            </p>
          </div>

          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-teal-900/35" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search agent, guest, voucher number, or hotel…"
              className="h-10 rounded-xl pr-9 pl-9"
              aria-label="Search bookings by agent, guest, voucher number, or hotel"
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
                  <TableHead className="text-teal-800/50">Voucher Number</TableHead>
                  <TableHead className="text-teal-800/50">Guest Name</TableHead>
                  <TableHead className="text-teal-800/50">Total Pax</TableHead>
                  <SortableHead
                    column="zone"
                    active={sortKey === 'zone'}
                    dir={sortDir}
                    onSort={toggleSort}
                  >
                    Pickup
                  </SortableHead>
                  <TableHead className="px-4 text-teal-800/50">Status</TableHead>
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
                      <BookingPickupCell booking={booking} onSetPickup={openPickupDialog} />
                    </TableCell>
                    <TableCell className="px-4">
                      <BookingStatusMenu
                        booking={booking}
                        onCancel={handleCancel}
                        onChangeDate={setDateTarget}
                        onRebook={setRebookTarget}
                        onEdit={setEditTarget}
                        onHistory={setHistoryTarget}
                      />
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

      <Dialog
        open={pickupTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPickupTarget(null)
            setPickupError('')
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Set pickup time</DialogTitle>
            <DialogDescription>
              {pickupTarget
                ? `${pickupTarget.code} · ${pickupTarget.pickupZone} · ${pickupTarget.leadGuest}`
                : null}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              handleSavePickup()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="booking-pickup-time">Pickup time</Label>
              <Input
                id="booking-pickup-time"
                type="time"
                value={pickupTime}
                onChange={(event) => {
                  setPickupTime(event.target.value)
                  if (pickupError) setPickupError('')
                }}
                className="h-10"
                required
              />
            </div>
            {pickupError ? <p className="text-sm text-red-600">{pickupError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPickupTarget(null)}>
                Cancel
              </Button>
              <Button type="submit">Save pickup time</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ChangeBookingDateDialog
        booking={dateTarget}
        open={dateTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDateTarget(null)
        }}
        bypassCutoff
        actor={adminActor}
      />

      <ChangeBookingDateDialog
        booking={rebookTarget}
        open={rebookTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRebookTarget(null)
        }}
        bypassCutoff
        mode="rebook"
        actor={adminActor}
      />

      <EditBookingDialog
        booking={editTarget}
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null)
        }}
        bypassCutoff
        actor={adminActor}
      />

      <BookingHistoryDialog
        booking={historyTarget}
        open={historyTarget !== null}
        onOpenChange={(open) => {
          if (!open) setHistoryTarget(null)
        }}
      />
    </div>
  )
}
