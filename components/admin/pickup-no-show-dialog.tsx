'use client'

import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { enrolledSeatCount } from '@/lib/check-in-enrollment'
import { formatGuestPaxParts, getOrCaptureBookedPaxSnapshot } from '@/lib/check-in-booked-pax'
import { recordPickupNoShow } from '@/lib/pickup-marina-sync'
import { totalPassengers, type Booking } from '@/lib/types'
import { cn } from '@/lib/utils'

export function PickupNoShowDialog({
  open,
  booking,
  today,
  onOpenChange,
  onWholeNoShow,
  onPickedUpAll,
}: {
  open: boolean
  booking: Booking | null
  today: string
  onOpenChange: (open: boolean) => void
  onWholeNoShow: (booking: Booking) => void
  onPickedUpAll: (booking: Booking, options?: { settle?: boolean }) => void
}) {
  const { updateBookingDetails, getCheckInEnrollments, trimCheckInEnrollments } = usePortal()
  const [nsAdults, setNsAdults] = useState(0)
  const [nsChildren, setNsChildren] = useState(0)
  const [nsInfants, setNsInfants] = useState(0)
  const [nsTourLeaders, setNsTourLeaders] = useState(0)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setNsAdults(0)
    setNsChildren(0)
    setNsInfants(0)
    setNsTourLeaders(0)
    setError('')
    setSaving(false)
  }, [open, booking?.code])

  if (!booking) return null

  const nsTotal = nsAdults + nsChildren + nsInfants + nsTourLeaders
  const currentTotal = totalPassengers(booking)
  const remaining = currentTotal - nsTotal
  const enrolled = enrolledSeatCount(
    getCheckInEnrollments(today, booking.program, booking.code),
  )
  const currentLabel = formatGuestPaxParts({
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    tourLeaders: booking.tourLeaders,
  })

  function applyPartial() {
    if (!booking) return
    setError('')
    if (nsTotal < 1) {
      setError('Choose how many AD / CH / INF / TL are no-show.')
      return
    }
    if (
      nsAdults > booking.adults ||
      nsChildren > booking.children ||
      nsInfants > booking.infants ||
      nsTourLeaders > booking.tourLeaders
    ) {
      setError('No-show counts cannot exceed this booking.')
      return
    }

    getOrCaptureBookedPaxSnapshot(today, booking.program, booking.code, {
      adults: booking.adults,
      children: booking.children,
      infants: booking.infants,
      tourLeaders: booking.tourLeaders,
    })
    recordPickupNoShow(today, booking.program, booking.code, {
      adults: nsAdults,
      children: nsChildren,
      infants: nsInfants,
      tourLeaders: nsTourLeaders,
    })

    const nextAdults = booking.adults - nsAdults
    const nextChildren = booking.children - nsChildren
    const nextInfants = booking.infants - nsInfants
    const nextTourLeaders = booking.tourLeaders - nsTourLeaders
    const nextTotal = nextAdults + nextChildren + nextInfants + nextTourLeaders

    if (nextTotal < 1) {
      onWholeNoShow(booking)
      onOpenChange(false)
      return
    }

    setSaving(true)
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
      { actor: { role: 'admin', name: 'Guest pick up' } },
    )
    setSaving(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    onPickedUpAll(booking, { settle: false })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="pr-8 font-display text-lg font-semibold text-teal-950">
            No show
          </DialogTitle>
          <DialogDescription className="text-teal-900/60">
            {booking.leadGuest}
            {booking.agentRef ? ` · ${booking.agentRef}` : ''} · {currentLabel}
          </DialogDescription>
        </DialogHeader>

        <button
          type="button"
          onClick={() => {
            onWholeNoShow(booking)
            onOpenChange(false)
          }}
          className="flex w-full flex-col items-start rounded-2xl bg-rose-50/80 px-4 py-3.5 text-left ring-1 ring-rose-200/80 transition-colors hover:bg-rose-50"
        >
          <span className="text-sm font-semibold text-rose-950">Whole booking</span>
          <span className="mt-0.5 text-xs text-rose-900/70">
            All guests no-show. Check-in will show NS — do not give this ticket.
          </span>
        </button>

        <div className="space-y-2.5 rounded-2xl px-4 py-3.5 ring-1 ring-teal-900/10">
          <div>
            <p className="text-sm font-semibold text-teal-950">Some guests only</p>
            <p className="mt-0.5 text-xs text-teal-900/55">
              Choose AD / CH / INF / TL who did not come. The rest stay on this booking.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <PaxStepper label="AD" value={nsAdults} max={booking.adults} onChange={setNsAdults} />
            <PaxStepper
              label="CH"
              value={nsChildren}
              max={booking.children}
              onChange={setNsChildren}
            />
            <PaxStepper
              label="INF"
              value={nsInfants}
              max={booking.infants}
              onChange={setNsInfants}
            />
            <PaxStepper
              label="TL"
              value={nsTourLeaders}
              max={booking.tourLeaders}
              onChange={setNsTourLeaders}
            />
          </div>
          <p className="text-xs text-teal-900/55">
            No-show {nsTotal}
            {nsTotal > 0 ? ` · left on trip ${Math.max(0, remaining)}` : ''}
          </p>
          {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          <Button type="button" size="sm" disabled={saving || nsTotal < 1} onClick={applyPartial}>
            Apply some guests
          </Button>
          <button
            type="button"
            onClick={() => {
              onPickedUpAll(booking, { settle: true })
              onOpenChange(false)
            }}
            className="flex w-full flex-col items-start rounded-xl bg-teal-50/80 px-3 py-2 text-left ring-1 ring-teal-700/15 transition-colors hover:bg-teal-50"
          >
            <span className="text-xs font-semibold text-teal-900">Picked up all</span>
            <span className="mt-0.5 text-[11px] text-teal-800/65">
              Remaining guests on this booking were picked up.
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function PaxStepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string
  value: number
  max: number
  onChange: (value: number) => void
}) {
  return (
    <div className="rounded-xl px-2 py-2 text-center ring-1 ring-teal-900/10">
      <p className="text-[10px] font-semibold tracking-wide text-teal-800/55 uppercase">{label}</p>
      <div className="mt-1 flex items-center justify-center gap-1">
        <button
          type="button"
          className="inline-flex size-7 items-center justify-center rounded-lg bg-teal-950/[0.05] text-teal-900 hover:bg-teal-950/[0.1] disabled:opacity-40"
          disabled={value <= 0}
          onClick={() => onChange(Math.max(0, value - 1))}
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
      <p className="mt-0.5 text-[10px] text-teal-900/40">of {max}</p>
    </div>
  )
}
