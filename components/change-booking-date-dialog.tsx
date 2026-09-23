'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AdminExtraChargeField,
  AmendmentPolicyNotice,
  LateDateChangeNotice,
} from '@/components/amendment-policy-notice'
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
import { dateChangeFeeAmount, formatThbAmount } from '@/lib/booking-cutoffs'
import { dateFromISO, formatLongDate, startOfToday, toISODate, todayISO } from '@/lib/format'
import { totalPassengers, type Booking, type BookingActor } from '@/lib/types'

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
    bookingCutoffs,
    getCapacity,
    isBookingOpen,
    isLateAmendment,
    isProgramClosed,
  } = usePortal()
  const [selected, setSelected] = useState<Date | undefined>()
  const [error, setError] = useState('')
  const [confirmLate, setConfirmLate] = useState(false)
  const [adminFee, setAdminFee] = useState('0')
  const isRebook = mode === 'rebook'
  const today = startOfToday()
  const todayIso = todayISO()
  const pax = booking ? totalPassengers(booking) : 0

  useEffect(() => {
    if (!open || !booking) return
    setSelected(dateFromISO(booking.date))
    setError('')
    setConfirmLate(false)
    setAdminFee(String(dateChangeFeeAmount(bookingCutoffs, booking)))
  }, [open, booking?.code])

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
    if (!bypassCutoff && iso < todayIso) return true
    if (!bypassCutoff && !isBookingOpen(iso)) return true
    if (!bypassCutoff && isProgramClosed(iso, booking.program)) return true
    if (!bypassCutoff && seatsLeftOn(iso) < pax) return true
    return false
  }

  const lateChange =
    !bypassCutoff && !isRebook && Boolean(booking) && isLateAmendment(booking!.date)
  const suggestedFee = booking ? dateChangeFeeAmount(bookingCutoffs, booking) : 0
  const lateFee = booking && lateChange ? suggestedFee : 0
  const parsedAdminFee = Math.max(0, Math.floor(Number(adminFee.replace(/,/g, '')) || 0))
  const needsAdminConfirm = bypassCutoff && !isRebook && Boolean(booking)
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
    if ((lateChange || needsAdminConfirm) && !confirmLate) {
      setConfirmLate(true)
      return
    }
    const result = isRebook
      ? rebookBooking(booking.code, nextIso, { bypassCutoff, actor })
      : changeBookingDate(booking.code, nextIso, {
          bypassCutoff,
          actor,
          lateChangeFee: needsAdminConfirm ? parsedAdminFee : undefined,
        })
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
                ? `${booking.code} · ${pax} pax · was ${formatLongDate(booking.date)}. Grey days are closed${bypassCutoff ? '' : ' or don’t have enough seats'}.`
                : `${booking.code} · ${pax} pax · currently ${formatLongDate(booking.date)}. ${
                    bypassCutoff
                      ? 'Admin can move any date, including closed or past days.'
                      : 'Grey days are closed or don’t have enough seats.'
                  }`
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
              setConfirmLate(false)
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
              bypassCutoff ? (
                <p className="w-full rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                  Over capacity — need {pax}, only {selectedInfo.seatsLeft} of{' '}
                  {selectedInfo.capacity} seats left. Admin can still move; confirm boat capacity
                  offline.
                </p>
              ) : (
                <p className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  Not enough seats — need {pax}, only {selectedInfo.seatsLeft} left
                  {selectedInfo.capacity > 0 ? ` (capacity ${selectedInfo.capacity})` : ''}.
                </p>
              )
            ) : (
              <p className="w-full rounded-xl border border-teal-200 bg-teal-50/80 px-3 py-2 text-sm text-teal-900/75">
                <span className="font-semibold text-teal-950">{selectedInfo.seatsLeft}</span> of{' '}
                {selectedInfo.capacity} seats left for {booking?.program}
                <span className="text-teal-900/40"> · {selectedInfo.booked} booked</span>
              </p>
            )
          ) : null}
          {bypassCutoff && !isRebook && booking ? (
            <AdminExtraChargeField
              suggested={suggestedFee}
              value={adminFee}
              onChange={setAdminFee}
              alreadyCharged={booking.lateChangeFee ?? 0}
              adults={booking.adults}
              childrenCount={booking.children}
              perPerson={bookingCutoffs.dateChangeFeePerPerson}
            />
          ) : !bypassCutoff ? (
            lateChange && booking ? (
              <LateDateChangeNotice settings={bookingCutoffs} booking={booking} className="w-full" />
            ) : (
              <AmendmentPolicyNotice
                settings={bookingCutoffs}
                variant="compact"
                className="w-full"
              />
            )
          ) : null}
        </div>
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              if (confirmLate) {
                setConfirmLate(false)
                return
              }
              onOpenChange(false)
            }}
          >
            {confirmLate ? 'Back' : 'Cancel'}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={
              !selected ||
              (selected ? dayUnavailable(selected) : true) ||
              selectedIso === booking?.date
            }
          >
            {isRebook
              ? 'Confirm rebook'
              : confirmLate
                ? needsAdminConfirm
                  ? parsedAdminFee > 0
                    ? `Confirm +${formatThbAmount(parsedAdminFee)}`
                    : 'Confirm — complimentary'
                  : `Confirm +${formatThbAmount(lateFee)}`
                : lateChange || needsAdminConfirm
                  ? 'Continue'
                  : 'Save new date'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
