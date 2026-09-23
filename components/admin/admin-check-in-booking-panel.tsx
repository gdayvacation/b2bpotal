'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { CalendarRange, CarFront, ChevronLeft, ChevronRight, Minus, Plus, Trash2, UserX, Users } from 'lucide-react'
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
import { NO_TRANSFER_TIME, NO_TRANSFER_ZONE, totalPassengers, type Booking } from '@/lib/types'
import {
  formatGuestPaxParts,
  getBookedPaxSnapshot,
  getOrCaptureBookedPaxSnapshot,
  type BookedPaxSnapshot,
} from '@/lib/check-in-booked-pax'
import {
  addPax,
  formatPaxOrDash,
  getOwnArrival,
  getPickupNoShow,
  paxTotal,
  recordOwnArrival,
} from '@/lib/pickup-marina-sync'

type PanelAction = 'ns-whole' | 'ns-some' | 'date' | 'own-arrival'

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
    assignBookingToVan,
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
  const [action, setAction] = useState<PanelAction>(null)
  const [arrAdults, setArrAdults] = useState(0)
  const [arrChildren, setArrChildren] = useState(0)
  const [arrInfants, setArrInfants] = useState(0)
  const [arrTourLeaders, setArrTourLeaders] = useState(0)
  const [arrivalError, setArrivalError] = useState('')
  const [arrivalSaving, setArrivalSaving] = useState(false)

  const bookingCode = booking?.code ?? ''

  useEffect(() => {
    if (!booking || !open) return
    const existing = getBookedPaxSnapshot(today, booking.program, booking.code)
    if (existing) {
      setOriginal(existing)
      return
    }
    const ns = getPickupNoShow(today, booking.program, booking.code)
    const taxi = getOwnArrival(today, booking.program, booking.code)
    if (paxTotal(ns) > 0) {
      setOriginal({
        adults: booking.adults - taxi.adults + ns.adults,
        children: booking.children - taxi.children + ns.children,
        infants: booking.infants - taxi.infants + ns.infants,
        tourLeaders: booking.tourLeaders - taxi.tourLeaders + ns.tourLeaders,
      })
      return
    }
    setOriginal(
      getOrCaptureBookedPaxSnapshot(today, booking.program, booking.code, {
        adults: booking.adults,
        children: booking.children,
        infants: booking.infants,
        tourLeaders: booking.tourLeaders,
      }),
    )
  }, [booking, open, today])

  useEffect(() => {
    if (!open || !bookingCode) return
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
    setAction(null)
    setArrAdults(0)
    setArrChildren(0)
    setArrInfants(0)
    setArrTourLeaders(0)
    setArrivalError('')
    setArrivalSaving(false)
  }, [bookingCode, open, today])

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
  const arrTotal = arrAdults + arrChildren + arrInfants + arrTourLeaders
  const missingPax = {
    adults: Math.max(0, (original?.adults ?? booking?.adults ?? 0) - (booking?.adults ?? 0)),
    children: Math.max(0, (original?.children ?? booking?.children ?? 0) - (booking?.children ?? 0)),
    infants: Math.max(0, (original?.infants ?? booking?.infants ?? 0) - (booking?.infants ?? 0)),
    tourLeaders: Math.max(
      0,
      (original?.tourLeaders ?? booking?.tourLeaders ?? 0) - (booking?.tourLeaders ?? 0),
    ),
  }
  const missingTotal =
    missingPax.adults + missingPax.children + missingPax.infants + missingPax.tourLeaders
  const canRestoreSeats = missingTotal > 0
  const arrMax = {
    adults: canRestoreSeats ? missingPax.adults : (booking?.adults ?? 0),
    children: canRestoreSeats ? missingPax.children : (booking?.children ?? 0),
    infants: canRestoreSeats ? missingPax.infants : (booking?.infants ?? 0),
    tourLeaders: canRestoreSeats ? missingPax.tourLeaders : (booking?.tourLeaders ?? 0),
  }
  const missingLabel = formatGuestPaxParts(missingPax)
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
      { actor, bypassCutoff: true, lateChangeFee: 0 },
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
        lateChangeFee: extraChargeAmount,
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
        lateChangeFee: extraChargeAmount,
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
      { actor, bypassCutoff: true, lateChangeFee: 0 },
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

  function applyOwnArrival() {
    if (!booking) return
    setArrivalError('')
    if (arrTotal < 1) {
      setArrivalError('Choose how many AD / CH / INF / TL came to the marina.')
      return
    }
    if (
      arrAdults > arrMax.adults ||
      arrChildren > arrMax.children ||
      arrInfants > arrMax.infants ||
      arrTourLeaders > arrMax.tourLeaders
    ) {
      setArrivalError('Counts cannot exceed the guests who are missing or on this booking.')
      return
    }

    const arrived = {
      adults: arrAdults,
      children: arrChildren,
      infants: arrInfants,
      tourLeaders: arrTourLeaders,
    }
    const arrivedLabel = formatGuestPaxParts(arrived)
    recordOwnArrival(today, booking.program, booking.code, arrived)
    const noteLine = `Own arrival ${arrivedLabel} — missed hotel pickup, came to marina`
    const note = booking.note.includes(noteLine)
      ? booking.note.trim()
      : [booking.note.trim(), noteLine].filter(Boolean).join(' · ')

    setArrivalSaving(true)
    if (attendance === 'no-show') {
      setCheckInAttendance(today, booking.program, booking.code, null)
    }

    if (canRestoreSeats) {
      const result = updateBookingDetails(
        booking.code,
        {
          adults: booking.adults + arrAdults,
          children: booking.children + arrChildren,
          infants: booking.infants + arrInfants,
          tourLeaders: booking.tourLeaders + arrTourLeaders,
          note,
        },
        { actor },
      )
      setArrivalSaving(false)
      if (!result.ok) {
        setArrivalError(result.error)
        return
      }
    } else {
      const arrivedAll = arrTotal >= currentTotal
      const result = updateBookingDetails(
        booking.code,
        {
          ...(attendance === 'no-show' && !arrivedAll
            ? {
                adults: arrAdults,
                children: arrChildren,
                infants: arrInfants,
                tourLeaders: arrTourLeaders,
              }
            : {}),
          ...(arrivedAll || attendance === 'no-show'
            ? {
                pickupZone: NO_TRANSFER_ZONE,
                pickupHotel: booking.pickupHotel,
                pickupTime: NO_TRANSFER_TIME,
              }
            : {}),
          note,
        },
        { actor },
      )
      if (arrivedAll || attendance === 'no-show') {
        assignBookingToVan(today, booking.program, booking.code, null)
      }
      setArrivalSaving(false)
      if (!result.ok) {
        setArrivalError(result.error)
        return
      }
    }

    setArrAdults(0)
    setArrChildren(0)
    setArrInfants(0)
    setArrTourLeaders(0)
    setAction(null)
  }

  function selectAction(next: PanelAction) {
    setAction(next)
    setError('')
    setDateError('')
    setArrivalError('')
  }

  function backToActions() {
    setAction(null)
    setError('')
    setDateError('')
    setArrivalError('')
  }

  const isWholeNoShow = attendance === 'no-show'
  const isOwnArrival = /own arrival/i.test(booking.note)
  const recordedPickupNs = getPickupNoShow(today, booking.program, booking.code)
  const recordedTaxi = getOwnArrival(today, booking.program, booking.code)
  const pickupNoShowPax =
    paxTotal(recordedPickupNs) > 0 ? recordedPickupNs : addPax(missingPax, recordedTaxi)
  const pickupNoShowLabel = formatPaxOrDash(pickupNoShowPax)
  const taxiLabel = formatPaxOrDash(recordedTaxi)
  const qrSeats = currentTotal
  const pickedUpLabel = currentLabel

  return (
    <Dialog
      open={open}
      disablePointerDismissal
      onOpenChange={(next, eventDetails) => {
        if (
          !next &&
          (eventDetails.reason === 'outside-press' || eventDetails.reason === 'focus-out')
        ) {
          return
        }
        onOpenChange(next)
      }}
    >
      <DialogContent className="top-4 flex max-h-[calc(100dvh-2rem)] w-full max-w-lg translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:top-6 sm:max-w-lg">
        <DialogHeader className="shrink-0 gap-1 px-4 pt-4 pr-12 pb-2">
          <DialogTitle>{booking.leadGuest}</DialogTitle>
          <DialogDescription>
            {booking.pickupHotel || booking.pickupZone} · {booking.code}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-2">
        <div className="grid grid-cols-2 gap-1.5 text-xs text-teal-900/70 sm:grid-cols-4">
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

        <div className="rounded-xl bg-teal-950/[0.04] px-3 py-2.5">
          <p className="text-[10px] font-semibold tracking-wide text-teal-800/50 uppercase">
            Synced from Guest Pick up
          </p>
          <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-teal-900/70">
            <div className="flex justify-between gap-2">
              <dt>Original booked</dt>
              <dd className="font-semibold text-teal-950">{originalLabel}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>No-show pickup</dt>
              <dd className="font-semibold text-rose-800">{pickupNoShowLabel}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Now on trip</dt>
              <dd className="font-semibold text-teal-950">{pickedUpLabel}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt>Came to marina</dt>
              <dd className="font-semibold text-sky-800">{taxiLabel}</dd>
            </div>
          </dl>
          <p className="mt-2 text-[11px] text-teal-900/55">
            QR check-in seats {enrolled}/{qrSeats}
            {canRestoreSeats
              ? ' · open Came to marina to add pickup no-shows who took a taxi'
              : ''}
          </p>
        </div>

        <div className="space-y-1.5">
          {!action ? (
            <>
              <p className="text-xs font-semibold tracking-wide text-teal-800/55 uppercase">
                What do you need?
              </p>

              {isWholeNoShow ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-rose-50 px-3 py-2.5 text-sm text-rose-900 ring-1 ring-rose-200/70">
                  Whole booking no-show
                  <Button size="sm" variant="outline" onClick={clearWholeNoShow}>
                    Undo
                  </Button>
                </div>
              ) : null}

              <ActionChoice
                icon={<UserX className="size-3.5" />}
                title="No-show all"
                hint="Driver pickup — whole booking missed"
                tone="rose"
                disabled={isWholeNoShow}
                onSelect={() => selectAction('ns-whole')}
              />
              <ActionChoice
                icon={<Users className="size-3.5" />}
                title="No-show some"
                hint="Driver pickup — only some guests missed"
                tone="rose"
                disabled={isWholeNoShow}
                onSelect={() => selectAction('ns-some')}
              />
              <ActionChoice
                icon={<CalendarRange className="size-3.5" />}
                title="Change date"
                hint="Move whole booking or some guests"
                tone="teal"
                disabled={isWholeNoShow}
                onSelect={() => selectAction('date')}
              />
              <ActionChoice
                icon={<CarFront className="size-3.5" />}
                title="Came to marina"
                hint="Missed pickup — open AD / CH / INF / TL to check in"
                tone="sky"
                onSelect={() => selectAction('own-arrival')}
              />
              {isOwnArrival ? (
                <p className="rounded-xl bg-sky-50 px-3 py-2.5 text-sm text-sky-950 ring-1 ring-sky-200/80">
                  Missed pickup — they came to the marina themselves. Still check in with QR.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={backToActions}
                className="flex items-center gap-1 text-xs font-semibold text-teal-800/70 hover:text-teal-950"
              >
                <ChevronLeft className="size-3.5" />
                All actions
              </button>

              {action === 'ns-whole' ? (
                <div className="rounded-xl px-3 py-3 ring-1 ring-rose-200/70">
                  <p className="text-sm font-semibold text-rose-950">No-show all</p>
                  <p className="mt-1 text-xs text-rose-900/70">
                    Marks All NS on Guest Pick up and Check-in. Frees the boat seat. Do not give
                    tickets.
                  </p>
                  <Button size="sm" className="mt-3" onClick={markWholeNoShow}>
                    Mark whole booking no-show
                  </Button>
                </div>
              ) : null}

              {action === 'ns-some' ? (
                <div className="rounded-xl px-3 py-3 ring-1 ring-rose-200/70">
                  <p className="text-sm font-semibold text-rose-950">No-show some</p>
                  <p className="mt-1 text-xs text-teal-900/55">
                    Remaining guests stay on the trip and can still check in.
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <PaxStepper label="AD" value={nsAdults} min={0} max={booking.adults} onChange={setNsAdults} />
                    <PaxStepper label="CH" value={nsChildren} min={0} max={booking.children} onChange={setNsChildren} />
                    <PaxStepper label="INF" value={nsInfants} min={0} max={booking.infants} onChange={setNsInfants} />
                    <PaxStepper
                      label="TL"
                      value={nsTourLeaders}
                      min={0}
                      max={booking.tourLeaders}
                      onChange={setNsTourLeaders}
                    />
                  </div>
                  <p className="mt-2 text-xs text-teal-900/55">
                    No-show {nsTotal}
                    {nsTotal > 0 ? ` · left on trip ${Math.max(0, remainingAfterNs)}` : ''}
                  </p>
                  {error ? <p className="text-sm text-rose-700">{error}</p> : null}
                  <Button size="sm" className="mt-2" disabled={saving || nsTotal < 1} onClick={applyPartialNoShow}>
                    Apply no-show
                  </Button>
                </div>
              ) : null}

              {action === 'date' ? (
                <div className="rounded-xl px-3 py-3 ring-1 ring-teal-900/10">
                  <p className="text-sm font-semibold text-teal-950">Change date</p>
                  <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-teal-950/[0.04] p-1">
                    <button
                      type="button"
                      onClick={() => setDateMode('whole')}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm font-semibold transition-all',
                        dateMode === 'whole'
                          ? 'bg-white text-teal-950 shadow-sm'
                          : 'text-teal-900/55 hover:text-teal-950',
                      )}
                    >
                      Whole
                    </button>
                    <button
                      type="button"
                      onClick={() => setDateMode('partial')}
                      className={cn(
                        'rounded-lg px-3 py-1.5 text-sm font-semibold transition-all',
                        dateMode === 'partial'
                          ? 'bg-white text-teal-950 shadow-sm'
                          : 'text-teal-900/55 hover:text-teal-950',
                      )}
                    >
                      Some guests
                    </button>
                  </div>
                  {dateMode === 'partial' ? (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <PaxStepper label="AD" value={moveAdults} min={0} max={booking.adults} onChange={setMoveAdults} />
                      <PaxStepper label="CH" value={moveChildren} min={0} max={booking.children} onChange={setMoveChildren} />
                      <PaxStepper label="INF" value={moveInfants} min={0} max={booking.infants} onChange={setMoveInfants} />
                      <PaxStepper
                        label="TL"
                        value={moveTourLeaders}
                        min={0}
                        max={booking.tourLeaders}
                        onChange={setMoveTourLeaders}
                      />
                    </div>
                  ) : null}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
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
                  <p className="mt-2 text-xs text-teal-900/55">
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
                    className="mt-2"
                    disabled={dateSaving || !newDate || (dateMode === 'partial' && moveTotal < 1)}
                    onClick={applyDateChange}
                  >
                    Apply date change
                  </Button>
                </div>
              ) : null}

              {action === 'own-arrival' ? (
                <div className="rounded-xl px-3 py-3 ring-1 ring-sky-200/80">
                  <p className="text-sm font-semibold text-sky-950">Came to marina</p>
                  <p className="mt-1 text-xs text-teal-900/60">
                    They missed hotel pickup and took a taxi. This is not a no-show. Opening seats
                    puts them back on the booking for QR check-in, invoice, and reports.
                  </p>
                  <p className="mt-2 text-xs text-teal-900/55">
                    Original {originalLabel}
                    {currentLabel !== originalLabel ? ` · now on trip ${currentLabel}` : ''}
                    {canRestoreSeats ? ` · missing from pickup ${missingLabel}` : ''}
                  </p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <PaxStepper label="AD" value={arrAdults} min={0} max={arrMax.adults} onChange={setArrAdults} />
                    <PaxStepper label="CH" value={arrChildren} min={0} max={arrMax.children} onChange={setArrChildren} />
                    <PaxStepper label="INF" value={arrInfants} min={0} max={arrMax.infants} onChange={setArrInfants} />
                    <PaxStepper
                      label="TL"
                      value={arrTourLeaders}
                      min={0}
                      max={arrMax.tourLeaders}
                      onChange={setArrTourLeaders}
                    />
                  </div>
                  <p className="mt-2 text-xs text-teal-900/55">
                    {canRestoreSeats
                      ? arrTotal > 0
                        ? `Open ${formatGuestPaxParts({
                            adults: arrAdults,
                            children: arrChildren,
                            infants: arrInfants,
                            tourLeaders: arrTourLeaders,
                          })} to check in`
                        : `Choose who is here from the ${missingLabel} missing pickup`
                      : isWholeNoShow
                        ? arrTotal > 0
                          ? `Clear All NS for ${formatGuestPaxParts({
                              adults: arrAdults,
                              children: arrChildren,
                              infants: arrInfants,
                              tourLeaders: arrTourLeaders,
                            })}`
                          : 'Choose who is here. Anyone not selected stays no-show.'
                        : arrTotal > 0
                          ? `Record own arrival ${formatGuestPaxParts({
                              adults: arrAdults,
                              children: arrChildren,
                              infants: arrInfants,
                              tourLeaders: arrTourLeaders,
                            })}`
                          : 'Choose who missed pickup and came by taxi.'}
                  </p>
                  {isWholeNoShow ? (
                    <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-xs text-amber-950/80">
                      This will clear All NS for the guests you open.
                    </p>
                  ) : null}
                  {arrivalError ? <p className="mt-2 text-sm text-rose-700">{arrivalError}</p> : null}
                  <Button
                    size="sm"
                    className="mt-3"
                    disabled={arrivalSaving || arrTotal < 1}
                    onClick={applyOwnArrival}
                  >
                    Open seats to check in
                  </Button>
                </div>
              ) : null}
            </>
          )}
        </div>

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
        </div>

        <DialogFooter className="mx-0 mb-0 shrink-0">
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

function ActionChoice({
  icon,
  title,
  hint,
  tone,
  disabled,
  onSelect,
}: {
  icon: ReactNode
  title: string
  hint: string
  tone: 'rose' | 'teal' | 'sky'
  disabled?: boolean
  onSelect: () => void
}) {
  const tones = {
    rose: {
      ring: 'ring-rose-200/70',
      icon: 'bg-rose-100 text-rose-800',
      title: 'text-rose-950',
    },
    teal: {
      ring: 'ring-teal-900/10',
      icon: 'bg-teal-100 text-teal-800',
      title: 'text-teal-950',
    },
    sky: {
      ring: 'ring-sky-200/80',
      icon: 'bg-sky-100 text-sky-800',
      title: 'text-sky-950',
    },
  }
  const t = tones[tone]
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left ring-1',
        t.ring,
        disabled && 'opacity-50',
      )}
    >
      <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-lg', t.icon)}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-sm font-semibold', t.title)}>{title}</span>
        <span className="mt-0.5 block text-[11px] text-teal-900/50">{hint}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-teal-900/35" />
    </button>
  )
}

function MetaChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-lg bg-teal-950/[0.04] px-2 py-1.5">
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
