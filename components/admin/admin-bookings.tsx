'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  AlertTriangle,
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
  Ticket,
  X,
} from 'lucide-react'
import { VoucherPreview } from '@/components/agent/voucher-view'
import { CancelConditionNotice } from '@/components/amendment-policy-notice'
import { BookingHistoryDialog } from '@/components/booking-history-dialog'
import { useInvoiceStore } from '@/components/admin/use-invoice-store'
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
import { bookingTourAmount, ratesForAgent } from '@/lib/invoice'
import { formatThbAmount, isLateAmendmentForDate } from '@/lib/booking-cutoffs'
import { usePortalTodayISO } from '@/lib/use-portal-today'
import { isNoTransfer, isPrivateTransfer, totalPassengers, type Booking, type Program } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Wider window when searching text fields; code search ignores this. */
function searchFromISO() {
  const d = startOfToday()
  d.setDate(d.getDate() - 7)
  return toISODate(d)
}

function AdminCancelChargeField({
  suggested,
  value,
  onChange,
  lateWindow,
}: {
  suggested: number
  value: string
  onChange: (value: string) => void
  lateWindow: boolean
}) {
  const parsed = Math.max(0, Math.floor(Number(value.replace(/,/g, '')) || 0))
  return (
    <div className="rounded-xl border border-teal-900/10 bg-teal-950/[0.03] px-3.5 py-3">
      <p className="text-[10px] font-semibold tracking-wide text-teal-800/60 uppercase">
        Cancel charge for Bills
      </p>
      <p className="mt-1 text-xs leading-relaxed text-teal-900/65">
        {lateWindow
          ? 'Agent rule now is late cancel — full tour price. You can still choose no charge or another amount.'
          : 'Agent rule now is free cancel. You can still add a charge if needed.'}{' '}
        This cancel amount, plus any existing change-date fee, goes to Bills.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onChange('0')}
          className={cn(
            'rounded-full px-2.5 py-1 text-[11px] font-semibold',
            parsed === 0
              ? 'bg-teal-800 text-white'
              : 'bg-white/80 text-teal-900/70 ring-1 ring-teal-900/10',
          )}
        >
          No charge
        </button>
        {suggested > 0 ? (
          <button
            type="button"
            onClick={() => onChange(String(suggested))}
            className={cn(
              'rounded-full px-2.5 py-1 text-[11px] font-semibold',
              parsed === suggested
                ? 'bg-teal-800 text-white'
                : 'bg-white/80 text-teal-900/70 ring-1 ring-teal-900/10',
            )}
          >
            Full price {formatThbAmount(suggested)}
          </button>
        ) : null}
      </div>
      <label className="mt-2.5 block">
        <span className="text-[11px] font-medium text-teal-900/70">Amount (THB)</span>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="mt-1 h-10 w-full rounded-lg border border-teal-900/12 bg-white px-3 text-sm text-teal-950 outline-none focus:border-teal-700"
        />
      </label>
    </div>
  )
}

function looksLikeBookingCodeQuery(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return false
  // Full or partial codes: PP2609-0229, 0229, pp2609, jb2701-0001
  return /^(pp|jb)?\d{0,4}-?\d{0,6}$/i.test(q) || q.includes('-')
}

/** Default list: newest first, capped so the table stays light. */
const RECENT_LIMIT = 200
const PAGE_SIZE = 50

type QuickFilter = 'all' | 'today'
type ProgramFilter = 'all' | Program
type SortKey = 'code' | 'date' | 'agent' | 'zone'
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
  onAddTransfer,
  onEditPrivate,
}: {
  booking: Booking
  onSetPickup: (booking: Booking) => void
  onAddTransfer: (booking: Booking) => void
  onEditPrivate: (booking: Booking) => void
}) {
  const cancelled = booking.status === 'Cancelled'
  const noTransfer = isNoTransfer(booking.pickupZone)
  const privateTransfer = isPrivateTransfer(booking)
  const awaiting = booking.status === 'Pending Pickup Time'

  if (cancelled) {
    const line = `${booking.pickupZone} ${booking.pickupTime}`.trim()
    return (
      <span className="block truncate" title={line}>
        {line}
      </span>
    )
  }

  if (noTransfer) {
    return (
      <button
        type="button"
        className="block w-full truncate rounded-md text-left text-teal-900 transition-colors hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-700/25"
        onClick={() => onAddTransfer(booking)}
        aria-label={`Add transfer for ${booking.code}`}
        title="No Transfer · Add transfer"
      >
        No Transfer
      </button>
    )
  }

  if (privateTransfer) {
    const vehicle = booking.privateTransferVehicle || 'Private'
    const line = [booking.pickupTime, vehicle].filter(Boolean).join(' ')
    return (
      <button
        type="button"
        className="block w-full truncate rounded-md text-left text-teal-900 transition-colors hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-700/25"
        onClick={() => onEditPrivate(booking)}
        aria-label={`Edit private transfer for ${booking.code}`}
        title={`Private ${line}`}
      >
        Pvt {line}
      </button>
    )
  }

  const line = awaiting ? `${booking.pickupZone} · set time` : `${booking.pickupZone} ${booking.pickupTime}`
  return (
    <button
      type="button"
      className={cn(
        'block w-full truncate rounded-md text-left transition-colors hover:bg-teal-50 focus-visible:ring-2 focus-visible:ring-teal-700/25',
        awaiting && 'text-amber-800',
      )}
      onClick={() => onSetPickup(booking)}
      aria-label={
        awaiting
          ? `Add pickup time for ${booking.code}`
          : `Edit pickup time for ${booking.code}`
      }
      title={line}
    >
      {line}
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
  onVoucher,
}: {
  booking: Booking
  onCancel: (booking: Booking) => void
  onChangeDate: (booking: Booking) => void
  onRebook: (booking: Booking) => void
  onEdit: (booking: Booking) => void
  onHistory: (booking: Booking) => void
  onVoucher: (booking: Booking) => void
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
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-teal-950 hover:bg-teal-50"
          onClick={() => {
            setOpen(false)
            onVoucher(booking)
          }}
        >
          <Ticket className="size-3.5 text-teal-800/50" />
          View voucher
        </button>
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
                onCancel(booking)
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
  const { bookings, bookingCutoffs, cancelBooking, hydrated, setBookingPickupTime } = usePortal()
  const invoiceStore = useInvoiceStore()
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
  const [editStartWithTransfer, setEditStartWithTransfer] = useState(false)
  const [historyTarget, setHistoryTarget] = useState<Booking | null>(null)
  const [voucherTarget, setVoucherTarget] = useState<Booking | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null)
  const [cancelCharge, setCancelCharge] = useState('0')
  const [cancelError, setCancelError] = useState('')

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
          const haystack = [
            booking.code,
            booking.agentName,
            booking.leadGuest,
            booking.agentRef,
            booking.pickupHotel,
          ]
            .join(' ')
            .toLowerCase()
          if (!haystack.includes(query)) return false
          // Text/name/hotel search stays recent; booking-number search covers all dates.
          if (!looksLikeBookingCodeQuery(query) && booking.date < searchFrom) return false
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
        if (sortKey === 'date') {
          return (
            dir * a.date.localeCompare(b.date) ||
            dir * a.code.localeCompare(b.code, undefined, { numeric: true })
          )
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
  const totalPax = useMemo(
    () =>
      list.reduce(
        (sum, booking) =>
          booking.status === 'Cancelled' ? sum : sum + totalPassengers(booking),
        0,
      ),
    [list],
  )

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
    setSortDir(key === 'date' || key === 'code' ? 'desc' : 'asc')
  }

  useEffect(() => {
    if (!createdCode) return
    setDismissCreated(false)
    setQuick('all')
    setProgram('all')
    setSelectedDate(undefined)
    setSearch('')
    setPage(1)
  }, [createdCode])

  function applyToday() {
    setQuick('today')
    setSelectedDate(undefined)
  }

  function applySelectedDate(next: Date | undefined) {
    setSelectedDate(next)
    if (next) setQuick('all')
  }

  function openCancel(booking: Booking) {
    const rates = ratesForAgent(invoiceStore.rates, booking.agentSlug)
    const suggested = bookingTourAmount(booking, rates)
    const late = isLateAmendmentForDate(bookingCutoffs, booking.date)
    setCancelCharge(late && suggested > 0 ? String(suggested) : '0')
    setCancelError('')
    setCancelTarget(booking)
  }

  function confirmAdminCancel() {
    if (!cancelTarget) return
    const amount = Math.max(0, Math.floor(Number(cancelCharge.replace(/,/g, '')) || 0))
    const result = cancelBooking(cancelTarget.code, {
      bypassCutoff: true,
      actor: adminActor,
      lateCancel: amount > 0,
      cancelFee: amount,
    })
    if (!result.ok) {
      setCancelError(result.error)
      return
    }
    setCancelTarget(null)
  }

  function openPickupDialog(booking: Booking) {
    setPickupTarget(booking)
    setPickupTime(toTimeInputValue(booking.pickupTime))
    setPickupError('')
  }

  function openAddTransfer(booking: Booking) {
    setEditStartWithTransfer(true)
    setEditTarget(booking)
  }

  function openEditDetails(booking: Booking) {
    setEditStartWithTransfer(false)
    setEditTarget(booking)
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
  const createdMissing =
    Boolean(createdCode) &&
    hydrated &&
    !bookings.some((booking) => booking.code === createdCode)
  const showingFrom = list.length === 0 ? 0 : pageStart + 1
  const showingTo = Math.min(pageStart + PAGE_SIZE, list.length)

  return (
    <div className="w-full">
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
        <div
          className={cn(
            'mb-4 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm',
            createdMissing
              ? 'border-amber-200 bg-amber-50/90 text-amber-950'
              : 'border-emerald-200 bg-emerald-50/80 text-emerald-900',
          )}
        >
          {createdMissing ? (
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-700" />
          ) : (
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-700" />
          )}
          <p className="min-w-0 flex-1">
            {createdMissing ? (
              <>
                Booking <span className="font-mono font-semibold">{createdCode}</span> is not in
                Supabase yet — check the red error bar at the top, or add the booking again.
              </>
            ) : (
              <>
                Booking <span className="font-mono font-semibold">{createdCode}</span> was added
                successfully.
              </>
            )}
          </p>
          <button
            type="button"
            className={cn(
              'rounded-md p-1',
              createdMissing
                ? 'text-amber-800/50 hover:bg-amber-100 hover:text-amber-900'
                : 'text-emerald-800/50 hover:bg-emerald-100 hover:text-emerald-900',
            )}
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
              {list.length > 0 ? ` · ${totalPax} pax` : null}
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
              placeholder="Search booking number, agent, guest, voucher, or hotel…"
              className="h-10 rounded-xl pr-9 pl-9"
              aria-label="Search bookings by booking number, agent, guest, voucher number, or hotel"
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
            {isSearching
              ? looksLikeBookingCodeQuery(query)
                ? ''
                : ' (name/hotel search covers last 7 days + upcoming; booking numbers search all dates)'
              : ''}
            .
          </div>
        ) : (
          <>
            <Table className="table-fixed text-[13px]" containerClassName="overflow-x-hidden">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortableHead
                    column="code"
                    className="w-[11%] px-2"
                    active={sortKey === 'code'}
                    dir={sortDir}
                    onSort={toggleSort}
                  >
                    Booking
                  </SortableHead>
                  <SortableHead
                    column="date"
                    className="w-[9%] px-2"
                    active={sortKey === 'date'}
                    dir={sortDir}
                    onSort={toggleSort}
                  >
                    Date
                  </SortableHead>
                  <TableHead className="w-[4%] px-1 text-center text-teal-800/50" title="Program">
                    PG
                  </TableHead>
                  <SortableHead
                    column="agent"
                    className="w-[13%] px-2"
                    active={sortKey === 'agent'}
                    dir={sortDir}
                    onSort={toggleSort}
                  >
                    Agent
                  </SortableHead>
                  <TableHead className="w-[8%] px-2 text-teal-800/50" title="Voucher number">
                    VC No.
                  </TableHead>
                  <TableHead className="w-[13%] px-2 text-teal-800/50">Guest</TableHead>
                  <TableHead className="w-[5%] px-1 text-center text-teal-800/50" title="Total pax">
                    Pax
                  </TableHead>
                  <TableHead className="w-[16%] px-2 text-teal-800/50">Hotel</TableHead>
                  <SortableHead
                    column="zone"
                    className="w-[11%] px-2"
                    active={sortKey === 'zone'}
                    dir={sortDir}
                    onSort={toggleSort}
                  >
                    Pickup
                  </SortableHead>
                  <TableHead className="w-[10%] px-2 text-teal-800/50">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pageRows.map((booking) => (
                  <TableRow
                    key={booking.code}
                    className={cn(
                      'cursor-pointer',
                      createdCode === booking.code && 'bg-emerald-50/70',
                      booking.status === 'Cancelled' && 'bg-rose-50/70 text-rose-900/80',
                    )}
                    onClick={() => setVoucherTarget(booking)}
                  >
                    <TableCell
                      className={cn(
                        'truncate px-2 font-mono text-[12px] font-medium hover:underline',
                        booking.status === 'Cancelled' && 'text-rose-800 line-through decoration-rose-300',
                      )}
                      title={booking.code}
                    >
                      {booking.code}
                    </TableCell>
                    <TableCell className="truncate px-2 hover:underline" title={formatShortDate(booking.date)}>
                      {formatShortDate(booking.date)}
                    </TableCell>
                    <TableCell className="px-1 text-center font-semibold tabular-nums text-teal-900/80">
                      {booking.program === 'PP' ? 'PP' : 'JB'}
                    </TableCell>
                    <TableCell className="truncate px-2 hover:underline" title={booking.agentName}>
                      {booking.agentName}
                    </TableCell>
                    <TableCell
                      className="truncate px-2 font-mono text-[12px] text-teal-900/70 hover:underline"
                      title={booking.agentRef?.trim() || undefined}
                    >
                      {booking.agentRef?.trim() ? booking.agentRef : '—'}
                    </TableCell>
                    <TableCell className="truncate px-2 hover:underline" title={booking.leadGuest}>
                      {booking.leadGuest}
                    </TableCell>
                    <TableCell className="px-1 text-center tabular-nums">
                      {totalPassengers(booking)}
                    </TableCell>
                    <TableCell
                      className="truncate px-2"
                      title={booking.pickupHotel.trim() || undefined}
                    >
                      {booking.pickupHotel.trim() || '—'}
                    </TableCell>
                    <TableCell className="px-2" onClick={(event) => event.stopPropagation()}>
                      <BookingPickupCell
                        booking={booking}
                        onSetPickup={openPickupDialog}
                        onAddTransfer={openAddTransfer}
                        onEditPrivate={openEditDetails}
                      />
                    </TableCell>
                    <TableCell className="px-2" onClick={(event) => event.stopPropagation()}>
                      <BookingStatusMenu
                        booking={booking}
                        onCancel={openCancel}
                        onChangeDate={setDateTarget}
                        onRebook={setRebookTarget}
                        onEdit={openEditDetails}
                        onHistory={setHistoryTarget}
                        onVoucher={setVoucherTarget}
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

      <Dialog
        open={voucherTarget !== null}
        onOpenChange={(open) => {
          if (!open) setVoucherTarget(null)
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogTitle className="sr-only">Voucher confirmation</DialogTitle>
          {voucherTarget ? (
            <VoucherPreview booking={voucherTarget} slug={voucherTarget.agentSlug} embedded />
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
                ? `${cancelTarget.code} · ${formatShortDate(cancelTarget.date)} · ${totalPassengers(cancelTarget)} pax. Admin can cancel anytime. Seats will free up.`
                : null}
            </DialogDescription>
          </DialogHeader>
          {cancelTarget ? (
            <div className="space-y-3">
              <CancelConditionNotice
                settings={bookingCutoffs}
                travelDate={cancelTarget.date}
                booking={cancelTarget}
                adminAnytime
              />
              {(cancelTarget.lateChangeFee ?? 0) > 0 ? (
                <p className="text-xs leading-relaxed text-teal-900/70">
                  Existing change-date fee {formatThbAmount(cancelTarget.lateChangeFee ?? 0)} still
                  goes to Bills with this booking.
                </p>
              ) : null}
              <AdminCancelChargeField
                suggested={bookingTourAmount(
                  cancelTarget,
                  ratesForAgent(invoiceStore.rates, cancelTarget.agentSlug),
                )}
                value={cancelCharge}
                onChange={setCancelCharge}
                lateWindow={isLateAmendmentForDate(bookingCutoffs, cancelTarget.date)}
              />
            </div>
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
            <Button type="button" variant="destructive" onClick={confirmAdminCancel}>
              {Number(cancelCharge.replace(/,/g, '')) > 0
                ? 'Cancel and charge'
                : 'Cancel — no charge'}
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
          if (!open) {
            setEditTarget(null)
            setEditStartWithTransfer(false)
          }
        }}
        bypassCutoff
        actor={adminActor}
        startWithTransfer={editStartWithTransfer}
        allowPrivateTransfer
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
