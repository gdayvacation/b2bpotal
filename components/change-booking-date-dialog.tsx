'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePortal } from '@/components/portal-provider'
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
import { formatLongDate, startOfToday, toISODate } from '@/lib/format'
import { totalPassengers, type Booking, type BookingActor } from '@/lib/types'

function dateFromISO(isoDate: string) {
  const [y, m, d] = isoDate.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export function ChangeBookingDateDialog({
  booking,
  open,
  onOpenChange,
  bypassCutoff = false,
  mode = 'change',
  actor,
}: {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Admin can always change/rebook; agents must pass cutoffs. */
  bypassCutoff?: boolean
  mode?: 'change' | 'rebook'
  actor?: BookingActor
}) {
  const {
    changeBookingDate,
    rebookBooking,
    bookedPaxFor,
    getCapacity,
    isBookingOpen,
    isProgramClosed,
  } = usePortal()
  const [selected, setSelected] = useState<Date | undefined>()
  const [error, setError] = useState('')
  const isRebook = mode === 'rebook'
  const today = startOfToday()
  const todayIso = toISODate(today)
  const pax = booking ? totalPassengers(booking) : 0

  useEffect(() => {
    if (!open || !booking) return
    setSelected(dateFromISO(booking.date))
    setError('')
  }, [open, booking])

  function seatsLeftOn(iso: string) {
    if (!booking) return 0
    const caps = getCapacity(iso)
    const capacity =
      booking.program === 'PP' ? caps.ppCapacity : caps.jamesBondCapacity
    const booked = bookedPaxFor(iso, booking.program)
    return Math.max(0, capacity - booked)
  }

  function dayUnavailable(day: Date) {
    if (!booking) return true
    const iso = toISODate(day)
    if (iso < todayIso) return true
    if (!bypassCutoff && !isBookingOpen(iso)) return true
    if (!bypassCutoff && isProgramClosed(iso, booking.program)) return true
    if (seatsLeftOn(iso) < pax) return true
    return false
  }

  const selectedIso = selected ? toISODate(selected) : null
  const selectedInfo = useMemo(() => {
    if (!booking || !selectedIso) return null
    const caps = getCapacity(selectedIso)
    const capacity =
      booking.program === 'PP' ? caps.ppCapacity : caps.jamesBondCapacity
    const booked = bookedPaxFor(selectedIso, booking.program)
    const seatsLeft = Math.max(0, capacity - booked)
    const closed =
      !bypassCutoff &&
      (!isBookingOpen(selectedIso) || isProgramClosed(selectedIso, booking.program))
    return { capacity, booked, seatsLeft, closed }
  }, [
    booking,
    selectedIso,
    getCapacity,
    bookedPaxFor,
    bypassCutoff,
    isBookingOpen,
    isProgramClosed,
  ])

  function handleSave() {
    if (!booking || !selected) {
      setError('Choose a travel date.')
      return
    }
    if (dayUnavailable(selected)) {
      setError(
        selectedInfo?.closed
          ? 'This date is closed for booking.'
          : `Not enough seats — need ${pax}, only ${selectedInfo?.seatsLeft ?? 0} left.`,
      )
      return
    }
    const nextIso = toISODate(selected)
    const result = isRebook
      ? rebookBooking(booking.code, nextIso, { bypassCutoff, actor })
      : changeBookingDate(booking.code, nextIso, { bypassCutoff, actor })
    if (!result.ok) {
      setError(result.error)
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isRebook ? 'Rebook' : 'Change travel date'}</DialogTitle>
          <DialogDescription>
            {booking
              ? isRebook
                ? `${booking.code} · ${pax} pax · was ${formatLongDate(booking.date)}. Grey days are closed or don’t have enough seats.`
                : `${booking.code} · ${pax} pax · currently ${formatLongDate(booking.date)}. Grey days are closed or don’t have enough seats.`
              : null}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3">
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(day) => {
              setSelected(day)
              setError('')
            }}
            defaultMonth={selected ?? today}
            disabled={dayUnavailable}
          />
          {selectedInfo && selectedIso ? (
            selectedInfo.closed ? (
              <p className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                This date is closed for booking.
              </p>
            ) : selectedInfo.seatsLeft < pax ? (
              <p className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                Not enough seats — need {pax}, only {selectedInfo.seatsLeft} left
                {selectedInfo.capacity > 0 ? ` (capacity ${selectedInfo.capacity})` : ''}.
              </p>
            ) : (
              <p className="w-full rounded-xl border border-teal-200 bg-teal-50/80 px-3 py-2 text-sm text-teal-900/75">
                <span className="font-semibold text-teal-950">{selectedInfo.seatsLeft}</span> of{' '}
                {selectedInfo.capacity} seats left for {booking?.program}
                <span className="text-teal-900/40"> · {selectedInfo.booked} booked</span>
              </p>
            )
          ) : null}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!selected || (selected ? dayUnavailable(selected) : true)}
          >
            {isRebook ? 'Confirm rebook' : 'Save new date'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
