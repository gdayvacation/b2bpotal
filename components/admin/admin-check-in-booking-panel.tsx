'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Minus, Plus, Trash2 } from 'lucide-react'
import { BoatFleetBadge } from '@/components/boat-badge'
import { usePortal } from '@/components/portal-provider'
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
import {
  enrolledSeatCount,
  guestDisplayName,
} from '@/lib/check-in-enrollment'
import {
  collectTotal,
  formatIncludeShort,
  formatLongDate,
  formatShortDate,
  parseCashOnTourAmount,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { totalPassengers, type Booking } from '@/lib/types'
import {
  formatGuestPaxParts,
  getOrCaptureBookedPaxSnapshot,
  type BookedPaxSnapshot,
} from '@/lib/check-in-booked-pax'

export function AdminCheckInBookingPanel({
  open,
  onOpenChange,
  booking,
  boat,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  booking: Booking | null
  boat: number | null
  today: string
}) {
  const {
    updateBookingDetails,
    addBooking,
    changeBookingDate,
    getCheckInEnrollments,
    getCheckInAttendance,
    removeCheckInEnrollment,
    trimCheckInEnrollments,
    setCheckInAttendance,
  } = usePortal()

  const [original, setOriginal] = useState<BookedPaxSnapshot | null>(null)
  const [nsAdults, setNsAdults] = useState(0)
  const [nsChildren, setNsChildren] = useState(0)
  const [nsInfants, setNsInfants] = useState(0)
  const [nsTourLeaders, setNsTourLeaders] = useState(0)
  const [dateMode, setDateMode] = useState<'whole' | 'partial'>('whole')
  const [moveAdults, setMoveAdults] = useState(0)
  const [moveChildren, setMoveChildren] = useState(0)
  const [moveInfants, setMoveInfants] = useState(0)
  const [moveTourLeaders, setMoveTourLeaders] = useState(0)
  const [newDate, setNewDate] = useState('')
  const [extraCharge, setExtraCharge] = useState('')
  const [error, setError] = useState('')
  const [dateError, setDateError] = useState('')
  const [saving, setSaving] = useState(false)
  const [dateSaving, setDateSaving] = useState(false)

  useEffect(() => {
    if (!booking || !open) return
    setOriginal(
      getOrCaptureBookedPaxSnapshot(today, booking.program, booking.code, {
        adults: booking.adults,
        children: booking.children,
        infants: booking.infants,
        tourLeaders: booking.tourLeaders,
      }),
    )
    setNsAdults(0)
    setNsChildren(0)
    setNsInfants(0)
    setNsTourLeaders(0)
    setDateMode('whole')
    setMoveAdults(0)
    setMoveChildren(0)
    setMoveInfants(0)
    setMoveTourLeaders(0)
    setNewDate('')
    setExtraCharge('')
    setError('')
    setDateError('')
  }, [booking, open, today])

  const enrollments = booking
    ? getCheckInEnrollments(today, booking.program, booking.code)
    : []
  const attendance = booking
    ? getCheckInAttendance(today, booking.program, booking.code)
    : null
  const enrolled = enrolledSeatCount(enrollments)
  const currentTotal = booking ? totalPassengers(booking) : 0
  const waiting = Math.max(0, currentTotal - enrolled)
  const nsTotal = nsAdults + nsChildren + nsInfants + nsTourLeaders
  const remainingAfterNs = currentTotal - nsTotal
  const moveTotal = moveAdults + moveChildren + moveInfants + moveTourLeaders
  const extraChargeAmount = Math.max(0, Math.floor(Number(extraCharge.replace(/,/g, '')) || 0))
  const actor = { role: 'admin' as const, name: 'Marina check-in' }

  const pay = booking
    ? collectTotal(
        booking.parkFee,
        booking.program,
        booking.adults,
        booking.children,
        booking.cashOnTour,
      )
    : 0
  const cashNote = booking?.cashOnTour.trim() ?? ''

  const originalLabel = useMemo(
    () => (original ? formatGuestPaxParts(original) : '—'),
    [original],
  )
  const currentLabel = booking
    ? formatGuestPaxParts({
        adults: booking.adults,
        children: booking.children,
        infants: booking.infants,
        tourLeaders: booking.tourLeaders,
      })
    : '—'

  if (!booking) return null

  function markWholeNoShow() {
    if (!booking) return
    setError('')
    setCheckInAttendance(today, booking.program, booking.code, 'no-show')
  }

  function clearWholeNoShow() {
    if (!booking) return
    setCheckInAttendance(today, booking.program, booking.code, null)
  }

  function applyPartialNoShow() {
    if (!booking) return
    setError('')
    if (nsTotal < 1) {
      setError('Choose how many AD / CH / INF / TL are no-show.')
      return
    }
    if (nsAdults > booking.adults || nsChildren > booking.children || nsInfants > booking.infants || nsTourLeaders > booking.tourLeaders) {
      setError('No-show counts cannot exceed the current booking.')
      return
    }

    const nextAdults = booking.adults - nsAdults
    const nextChildren = booking.children - nsChildren
    const nextInfants = booking.infants - nsInfants
    const nextTourLeaders = booking.tourLeaders - nsTourLeaders
    const nextTotal = nextAdults + nextChildren + nextInfants + nextTourLeaders

    setSaving(true)

    if (nextTotal < 1) {
      setCheckInAttendance(today, booking.program, booking.code, 'no-show')
      setSaving(false)
      setNsAdults(0)
      setNsChildren(0)
      setNsInfants(0)
      setNsTourLeaders(0)
      return
    }

    if (nextTotal < enrolled) {
      trimCheckInEnrollments(today, booking.program, booking.code, nextTotal)
    }

    const result = updateBookingDetails(
      booking.code,
      {
        adults: nextAdults,
        children: nextChildren,
        infants: nextInfants,
        tourLeaders: nextTourLeaders,
      },
      { actor },
    )
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setNsAdults(0)
    setNsChildren(0)
    setNsInfants(0)
    setNsTourLeaders(0)
  }

  function applyDateChange() {
    if (!booking) return
    setDateError('')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
      setDateError('Choose a new travel date.')
      return
    }
    if (newDate === booking.date) {
      setDateError('Pick a different date from this trip.')
      return
    }

    setDateSaving(true)

    if (dateMode === 'whole') {
      const moved = changeBookingDate(booking.code, newDate, {
        bypassCutoff: true,
        actor,
      })
      if (!moved.ok) {
        setDateSaving(false)
        setDateError(moved.error)
        return
      }
      if (extraChargeAmount > 0) {
        const paid = updateBookingDetails(
          booking.code,
          { cashOnTour: mergeCashOnTour(booking.cashOnTour, extraChargeAmount) },
          { actor },
        )
        if (!paid.ok) {
          setDateSaving(false)
          setDateError(paid.error)
          return
        }
      }
      setDateSaving(false)
      setNewDate('')
      setExtraCharge('')
      onOpenChange(false)
      return
    }

    if (moveTotal < 1) {
      setDateSaving(false)
      setDateError('Choose how many AD / CH / INF / TL to move to the new date.')
      return
    }
    if (
      moveAdults > booking.adults ||
      moveChildren > booking.children ||
      moveInfants > booking.infants ||
      moveTourLeaders > booking.tourLeaders
    ) {
      setDateSaving(false)
      setDateError('Move counts cannot exceed the current booking.')
      return
    }

    const stayAdults = booking.adults - moveAdults
    const stayChildren = booking.children - moveChildren
    const stayInfants = booking.infants - moveInfants
    const stayTourLeaders = booking.tourLeaders - moveTourLeaders
    const stayTotal = stayAdults + stayChildren + stayInfants + stayTourLeaders

    if (stayTotal < 1) {
      const moved = changeBookingDate(booking.code, newDate, {
        bypassCutoff: true,
        actor,
      })
      if (!moved.ok) {
        setDateSaving(false)
        setDateError(moved.error)
        return
      }
      if (extraChargeAmount > 0) {
        updateBookingDetails(
          booking.code,
          { cashOnTour: mergeCashOnTour(booking.cashOnTour, extraChargeAmount) },
          { actor },
        )
      }
      setDateSaving(false)
      onOpenChange(false)
      return
    }

    if (stayTotal < enrolled) {
      trimCheckInEnrollments(today, booking.program, booking.code, stayTotal)
    }

    const shrink = updateBookingDetails(
      booking.code,
      {
        adults: stayAdults,
        children: stayChildren,
        infants: stayInfants,
        tourLeaders: stayTourLeaders,
      },
      { actor },
    )
    if (!shrink.ok) {
      setDateSaving(false)
      setDateError(shrink.error)
      return
    }

    const created = addBooking(
      {
        agentSlug: booking.agentSlug,
        agentName: booking.agentName,
        agentRef: booking.agentRef,
        program: booking.program,
        date: newDate,
        parkFee: booking.parkFee,
        canoe: booking.canoe,
        adults: moveAdults,
        children: moveChildren,
        infants: moveInfants,
        tourLeaders: moveTourLeaders,
        leadGuest: booking.leadGuest,
        pickupZone: booking.pickupZone,
        pickupHotel: booking.pickupHotel,
        roomNumber: booking.roomNumber,
        note: `Date change from ${booking.code} (${booking.date})`,
        cashOnTour:
          extraChargeAmount > 0 ? `${extraChargeAmount.toLocaleString('en-US')} THB` : '',
        pickupTime: booking.pickupTime,
      },
      { bypassCutoff: true, actor },
    )
    setDateSaving(false)
    if (!created.ok) {
      setDateError(created.error)
      return
    }
    setMoveAdults(0)
    setMoveChildren(0)
    setMoveInfants(0)
    setMoveTourLeaders(0)
    setNewDate('')
    setExtraCharge('')
  }

  const isWholeNoShow = attendance === 'no-show'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8">{booking.leadGuest}</DialogTitle>
          <DialogDescription>
            {booking.pickupHotel || booking.pickupZone} · {booking.code}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2 text-xs text-teal-900/70 sm:grid-cols-4">
          <MetaChip label="Boat" value={<BoatFleetBadge boat={boat} />} />
          <MetaChip label="Park" value={formatIncludeShort(booking.parkFee)} />
          <MetaChip
            label="Pay"
            value={pay > 0 ? `${pay.toLocaleString('en-US')} THB` : cashNote || '—'}
          />
          <MetaChip
            label="Check-in"
            value={isWholeNoShow ? 'No-show' : `${enrolled}/${currentTotal}`}
          />
        </div>

        <div className="rounded-2xl bg-teal-950/[0.04] px-4 py-3.5">
          <p className="text-[11px] font-semibold tracking-wide text-teal-800/55 uppercase">
            Original booking
          </p>
          <p className="mt-1 text-base font-semibold text-teal-950">{originalLabel}</p>
          {currentLabel !== originalLabel ? (
            <p className="mt-1 text-xs text-teal-900/55">
              Now on trip: <span className="font-semibold text-teal-950">{currentLabel}</span>
            </p>
          ) : null}
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold tracking-wide text-teal-800/55 uppercase">
            Adjust booking
          </p>

          {isWholeNoShow ? (
            <div className="flex items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-900 ring-1 ring-rose-200/70">
              Whole booking marked no-show
              <Button size="sm" variant="outline" onClick={clearWholeNoShow}>
                Undo
              </Button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={markWholeNoShow}
                className="flex w-full flex-col items-start rounded-2xl px-4 py-3.5 text-left ring-1 ring-rose-200/80 bg-rose-50/70 transition-colors hover:bg-rose-50"
              >
                <span className="text-sm font-semibold text-rose-950">1. No-show whole booking</span>
                <span className="mt-0.5 text-xs text-rose-900/70">
                  Removes this booking from today’s boat arrangement.
                </span>
              </button>

              <div className="space-y-2.5 rounded-2xl px-4 py-3.5 ring-1 ring-teal-900/10">
                <div>
                  <p className="text-sm font-semibold text-teal-950">2. No-show some</p>
                  <p className="mt-0.5 text-xs text-teal-900/55">
                    Choose how many of each type did not come. Saves to booking and boat seats.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <PaxStepper
                    label="AD"
                    value={nsAdults}
                    min={0}
                    max={booking.adults}
                    onChange={setNsAdults}
                  />
                  <PaxStepper
                    label="CH"
                    value={nsChildren}
                    min={0}
                    max={booking.children}
                    onChange={setNsChildren}
                  />
                  <PaxStepper
                    label="INF"
                    value={nsInfants}
                    min={0}
                    max={booking.infants}
                    onChange={setNsInfants}
                  />
                  <PaxStepper
                    label="TL"
                    value={nsTourLeaders}
                    min={0}
                    max={booking.tourLeaders}
                    onChange={setNsTourLeaders}
                  />
                </div>
                <p className="text-xs text-teal-900/55">
                  No-show {nsTotal}
                  {nsTotal > 0 ? ` · left on trip ${Math.max(0, remainingAfterNs)}` : ''}
                  {remainingAfterNs > 0 && remainingAfterNs < enrolled
                    ? ` · will trim ${enrolled - remainingAfterNs} checked-in seat(s)`
                    : ''}
                </p>
                {error ? <p className="text-sm text-rose-700">{error}</p> : null}
                <Button
                  size="sm"
                  disabled={saving || nsTotal < 1}
                  onClick={applyPartialNoShow}
                >
                  Apply no-show
                </Button>
              </div>
            </>
          )}
        </div>

        {!isWholeNoShow ? (
          <div className="space-y-3 rounded-2xl px-4 py-3.5 ring-1 ring-teal-900/10">
            <div>
              <p className="text-xs font-semibold tracking-wide text-teal-800/55 uppercase">
                Change date
              </p>
              <p className="mt-0.5 text-xs text-teal-900/55">
                Move whole booking or some guests to another day. Optional extra charge goes to cash
                on tour.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 rounded-xl bg-teal-950/[0.04] p-1">
              <button
                type="button"
                onClick={() => setDateMode('whole')}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                  dateMode === 'whole'
                    ? 'bg-white text-teal-950 shadow-sm'
                    : 'text-teal-900/55 hover:text-teal-950',
                )}
              >
                Whole booking
              </button>
              <button
                type="button"
                onClick={() => setDateMode('partial')}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-semibold transition-all',
                  dateMode === 'partial'
                    ? 'bg-white text-teal-950 shadow-sm'
                    : 'text-teal-900/55 hover:text-teal-950',
                )}
              >
                Partial
              </button>
            </div>

            {dateMode === 'partial' ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <PaxStepper
                  label="AD"
                  value={moveAdults}
                  min={0}
                  max={booking.adults}
                  onChange={setMoveAdults}
                />
                <PaxStepper
                  label="CH"
                  value={moveChildren}
                  min={0}
                  max={booking.children}
                  onChange={setMoveChildren}
                />
                <PaxStepper
                  label="INF"
                  value={moveInfants}
                  min={0}
                  max={booking.infants}
                  onChange={setMoveInfants}
                />
                <PaxStepper
                  label="TL"
                  value={moveTourLeaders}
                  min={0}
                  max={booking.tourLeaders}
                  onChange={setMoveTourLeaders}
                />
              </div>
            ) : null}

            <div className="grid gap-2 sm:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-teal-800/55 uppercase">
                  New date
                </p>
                <Input
                  type="date"
                  value={newDate}
                  min={today}
                  onChange={(event) => setNewDate(event.target.value)}
                  className="h-10"
                />
              </div>
              <div>
                <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-teal-800/55 uppercase">
                  Extra charge (THB)
                </p>
                <Input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  placeholder="0"
                  value={extraCharge}
                  onChange={(event) => setExtraCharge(event.target.value)}
                  className="h-10"
                />
              </div>
            </div>

            <p className="text-xs text-teal-900/55">
              {dateMode === 'whole'
                ? `Moves all ${currentTotal} guest${currentTotal === 1 ? '' : 's'}`
                : `Move ${moveTotal} · stay ${Math.max(0, currentTotal - moveTotal)}`}
              {extraChargeAmount > 0
                ? ` · extra ${extraChargeAmount.toLocaleString('en-US')} THB`
                : ''}
            </p>
            {dateError ? <p className="text-sm text-rose-700">{dateError}</p> : null}
            <Button
              size="sm"
              disabled={
                dateSaving ||
                !newDate ||
                (dateMode === 'partial' && moveTotal < 1)
              }
              onClick={applyDateChange}
            >
              Apply date change
            </Button>
          </div>
        ) : null}

        <div className="space-y-2">
          <p className="text-xs font-semibold tracking-wide text-teal-800/55 uppercase">
            Checked in ({enrolled})
          </p>
          {enrollments.length === 0 ? (
            <p className="rounded-xl bg-teal-950/[0.03] px-3 py-2.5 text-sm text-teal-900/50">
              No guests checked in yet.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {enrollments.map((enrollment) => (
                <li
                  key={enrollment.id}
                  className="flex items-start justify-between gap-2 rounded-xl bg-emerald-50/70 px-3 py-2.5 ring-1 ring-emerald-200/60"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-teal-950">
                      {guestDisplayName(enrollment)}
                      {enrollment.seats > 1 ? ` · ${enrollment.seats} seats` : ''}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-teal-900/55">
                      {[
                        enrollment.nationality,
                        enrollment.birthday ? formatShortDate(enrollment.birthday) : '',
                        enrollment.passportNumber,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    <p className="mt-0.5 text-[11px] text-teal-900/40">
                      {formatCheckInTime(enrollment.checkedInAt)}
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                    aria-label={`Remove ${guestDisplayName(enrollment)}`}
                    onClick={() =>
                      removeCheckInEnrollment(
                        today,
                        booking.program,
                        booking.code,
                        enrollment.id,
                      )
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {waiting > 0 && !isWholeNoShow ? (
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-950/80 ring-1 ring-amber-200/70">
            {waiting} seat{waiting === 1 ? '' : 's'} still waiting to check in.
          </p>
        ) : null}

        <DialogFooter>
          <p className="mr-auto hidden text-[11px] text-teal-900/45 sm:block">
            {formatLongDate(today)}
          </p>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MetaChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-xl bg-teal-950/[0.04] px-2.5 py-2">
      <p className="text-[10px] font-semibold tracking-wide text-teal-800/50 uppercase">
        {label}
      </p>
      <div className="mt-0.5 text-sm font-medium text-teal-950">{value}</div>
    </div>
  )
}

function PaxStepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="rounded-xl ring-1 ring-teal-900/10 px-2 py-2 text-center">
      <p className="text-[10px] font-semibold tracking-wide text-teal-800/55 uppercase">
        {label}
      </p>
      <div className="mt-1 flex items-center justify-center gap-1">
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-lg bg-teal-950/[0.05] text-teal-900 hover:bg-teal-950/[0.1] disabled:opacity-40"
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${label}`}
        >
          <Minus className="size-3.5" />
        </button>
        <span className="w-6 tabular-nums text-sm font-semibold text-teal-950">{value}</span>
        <button
          type="button"
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-lg bg-teal-950/[0.05] text-teal-900 hover:bg-teal-950/[0.1] disabled:opacity-40',
          )}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
      <p className="mt-0.5 text-[10px] text-teal-900/40">max {max}</p>
    </div>
  )
}

function formatCheckInTime(iso: string) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Bangkok',
  })
}

function mergeCashOnTour(existing: string, extra: number) {
  if (extra <= 0) return existing.trim()
  const current = parseCashOnTourAmount(existing)
  const total = current + extra
  return `${total.toLocaleString('en-US')} THB`
}
