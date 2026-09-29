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
import { formatThbAmount } from '@/lib/booking-cutoffs'
import { bookingTourAmount, parseAgentBillingType, ratesForAgent } from '@/lib/invoice'
import { useInvoiceStore } from '@/components/admin/use-invoice-store'
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
  const invoiceStore = useInvoiceStore()
  const [selected, setSelected] = useState<Date | undefined>()
  const [error, setError] = useState('')
  const [confirmLate, setConfirmLate] = useState(false)
  const [adminFee, setAdminFee] = useState('0')
  const isRebook = mode === 'rebook'
  const today = startOfToday()
  const todayIso = todayISO()
  const pax = booking ? totalPassengers(booking) : 0
  const agentRates = booking
    ? ratesForAgent(invoiceStore.rates, booking.agentSlug)
    : null
  const prebuy = agentRates ? parseAgentBillingType(agentRates.billingType) === 'prebuy' : false
  const fullTourFee = booking && agentRates ? bookingTourAmount(booking, agentRates) : 0
  /** Same auto rule as Add Booking policy: after lateFeeFromTime → charge. */
  const autoLate =
    !isRebook && Boolean(booking) && isLateAmendment(booking!.date)
  const autoFee = autoLate ? fullTourFee : 0

  useEffect(() => {
    if (!open || !booking) return
    setSelected(dateFromISO(booking.date))
    setError('')
    setConfirmLate(false)
    // Admin starts on the same auto amount agents get — waive with Free if needed.
    setAdminFee(String(autoFee))
  }, [open, booking?.code, autoFee])

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
    if (iso !== booking.date && seatsLeftOn(iso) < pax) return true
    return false
  }

  const lateChange = !bypassCutoff && autoLate
  const parsedAdminFee = Math.max(0, Math.floor(Number(adminFee.replace(/,/g, '')) || 0))
  const needsAdminConfirm = bypassCutoff && !isRebook && Boolean(booking) && autoLate
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
          // Keep in sync with Add Booking cutoff policy (auto after 8:00 Thailand).
          lateDateChange: needsAdminConfirm ? parsedAdminFee > 0 : lateChange ? true : undefined,
          lateChangeFee: needsAdminConfirm ? parsedAdminFee : undefined,
        })
    if (!result.ok) {
      setError(result.error)
      return
    }
    onOpenChange(false)
  }

  const dateDialogCopy = booking
    ? isRebook
      ? `${booking.code} · ${pax} pax · was ${formatLongDate(booking.date)}. Grey days are closed or do not have enough seats.`
      : `${booking.code} · ${pax} pax · currently ${formatLongDate(booking.date)}. ${
          bypassCutoff
            ? 'Admin can move any date, including closed or past days, if seats are left. Charge follows the same Add Booking rule (auto after 8:00 Thailand).'
            : 'Grey days are closed or do not have enough seats.'
        }`
    : null

  const confirmLabel = (() => {
    if (isRebook) return 'Confirm rebook'
    if (!confirmLate) {
      return lateChange || needsAdminConfirm ? 'Continue' : 'Save new date'
    }
    if (needsAdminConfirm) {
      if (parsedAdminFee <= 0) return 'Confirm — complimentary'
      return prebuy
        ? 'Confirm · Prebuy head deduct'
        : `Confirm +${formatThbAmount(parsedAdminFee)}`
    }
    if (prebuy) return 'Confirm · Prebuy head deduct'
    return `Confirm +${formatThbAmount(autoFee)}`
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isRebook ? 'Rebook' : 'Change travel date'}</DialogTitle>
          <DialogDescription>{dateDialogCopy}</DialogDescription>
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
              <p className="w-full rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
                Not enough seats — need {pax}, only {selectedInfo.seatsLeft} left
                {selectedInfo.capacity > 0 ? ` (boat limit ${selectedInfo.capacity})` : ''}.
              </p>
            ) : (
              <p className="w-full rounded-xl border border-teal-200 bg-teal-50/80 px-3 py-2 text-sm text-teal-900/75">
                <span className="font-semibold text-teal-950">{selectedInfo.seatsLeft}</span> of{' '}
                {selectedInfo.capacity} seats left for {booking?.program}
                <span className="text-teal-900/40"> · {selectedInfo.booked} booked</span>
              </p>
            )
          ) : null}
          {bypassCutoff && !isRebook && booking && autoLate ? (
            <AdminExtraChargeField
              suggested={autoFee}
              value={adminFee}
              onChange={setAdminFee}
              alreadyCharged={booking.lateDateChange ? fullTourFee : 0}
              adults={booking.adults}
              childrenCount={booking.children}
              mode="full-price"
            />
          ) : !bypassCutoff ? (
            lateChange && booking ? (
              <LateDateChangeNotice
                settings={bookingCutoffs}
                booking={booking}
                fullPriceThb={prebuy ? undefined : fullTourFee}
                className="w-full"
              />
            ) : (
              <AmendmentPolicyNotice
                settings={bookingCutoffs}
                variant="compact"
                className="w-full"
              />
            )
          ) : bypassCutoff && !isRebook && booking && !autoLate ? (
            <p className="w-full rounded-xl border border-teal-200 bg-teal-50/80 px-3 py-2 text-sm text-teal-900/75">
              Before {bookingCutoffs.lateFeeFromTime} Thailand — change date is free (same as Add
              Booking).
            </p>
          ) : null}
          {lateChange && prebuy ? (
            <p className="w-full text-xs leading-relaxed text-amber-950/80">
              Prebuy agent: late change deducts AD+CH heads like a no-show (no money line).
            </p>
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
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
