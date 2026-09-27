'use client'

import { useEffect, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  clearArrivedPaxSnapshot,
  getArrivedPaxSnapshot,
  setArrivedPaxSnapshot,
} from '@/lib/check-in-arrived-pax'
import {
  formatGuestPaxParts,
  replaceBookedPaxSnapshot,
} from '@/lib/check-in-booked-pax'
import {
  appendRemark,
  bookingPaxSnapshot,
  formatPaxChangeRemark,
  paxSnapshotsEqual,
  syncPaxChangeToInvoices,
} from '@/lib/check-in-pax-edit'
import { thaiParkSeatsFromGuests } from '@/lib/format'
import { cn } from '@/lib/utils'
import { type Booking } from '@/lib/types'

const PAX_MAX = 30

type ApplyScope = 'check-in' | 'booking-invoice'

export function AdminCheckInPaxDialog({
  booking,
  open,
  onOpenChange,
  onApplied,
}: {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onApplied?: () => void
}) {
  const {
    updateBookingDetails,
    getCheckInNote,
    setCheckInNote,
    getCheckInEnrollments,
  } = usePortal()
  const [adults, setAdults] = useState(0)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)
  const [tourLeaders, setTourLeaders] = useState(0)
  const [reason, setReason] = useState('')
  const [scope, setScope] = useState<ApplyScope>('check-in')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !booking) return
    const arrived = getArrivedPaxSnapshot(booking.date, booking.program, booking.code)
    const start = arrived ?? bookingPaxSnapshot(booking)
    setAdults(start.adults)
    setChildren(start.children)
    setInfants(start.infants)
    setTourLeaders(start.tourLeaders)
    setReason('')
    setScope('check-in')
    setError('')
    setSaving(false)
  }, [booking, open])

  const booked = booking ? bookingPaxSnapshot(booking) : null
  const next = { adults, children, infants, tourLeaders }
  const total = adults + children + infants + tourLeaders
  const mixChanged = booked ? !paxSnapshotsEqual(booked, next) : false
  const syncBooking = scope === 'booking-invoice'

  async function save() {
    if (!booking || !booked) return
    setError('')
    const arrived = getArrivedPaxSnapshot(booking.date, booking.program, booking.code)
    if (!mixChanged) {
      if (arrived && paxSnapshotsEqual(arrived, next)) {
        setError('Change AD / CH / INF / TL first.')
        return
      }
      if (arrived && paxSnapshotsEqual(booked, next)) {
        clearArrivedPaxSnapshot(booking.date, booking.program, booking.code)
        onApplied?.()
        onOpenChange(false)
        return
      }
      setError('Change AD / CH / INF / TL first.')
      return
    }
    if (total < 1) {
      setError('At least 1 guest is required.')
      return
    }
    const why = reason.trim()
    if (syncBooking && !why) {
      setError('Write why the guest mix changed. This note goes on the booking, voucher, and invoice.')
      return
    }

    const remark = formatPaxChangeRemark(booked, next, why)
    setSaving(true)

    if (!syncBooking) {
      setArrivedPaxSnapshot(booking.date, booking.program, booking.code, next)
      if (why) {
        setCheckInNote(
          booking.date,
          booking.program,
          booking.code,
          appendRemark(getCheckInNote(booking.date, booking.program, booking.code), remark),
        )
      }
      setSaving(false)
      onApplied?.()
      onOpenChange(false)
      return
    }

    const note = appendRemark(booking.note, remark)
    const result = updateBookingDetails(
      booking.code,
      {
        adults,
        children,
        infants,
        tourLeaders,
        note,
      },
      { bypassCutoff: true, actor: { role: 'admin', name: 'Marina check-in' } },
    )
    if (!result.ok && result.error !== 'No changes to save.') {
      setSaving(false)
      setError(result.error)
      return
    }

    clearArrivedPaxSnapshot(booking.date, booking.program, booking.code)
    replaceBookedPaxSnapshot(booking.date, booking.program, booking.code, next)
    setCheckInNote(
      booking.date,
      booking.program,
      booking.code,
      appendRemark(getCheckInNote(booking.date, booking.program, booking.code), remark),
    )

    const liveBooking = result.ok ? result.booking : { ...booking, ...next, note }
    try {
      const enrollments = getCheckInEnrollments(booking.date, booking.program, booking.code)
      await syncPaxChangeToInvoices(
        liveBooking,
        next,
        remark,
        thaiParkSeatsFromGuests(adults, children, enrollments),
      )
    } catch (err) {
      setSaving(false)
      setError(`Guests saved, but invoice sync failed: ${String(err)}`)
      return
    }

    setSaving(false)
    onApplied?.()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle className="pr-8 font-display text-lg font-semibold text-teal-950">
            Edit guests
          </DialogTitle>
          <DialogDescription className="text-teal-900/60">
            {booking
              ? `${booking.leadGuest} · ${booking.code}. Change who actually arrived at check-in.`
              : 'Change who actually arrived at check-in.'}
          </DialogDescription>
        </DialogHeader>

        {booking && booked ? (
          <div className="space-y-3">
            <p className="text-xs text-teal-900/55">
              Booked {formatGuestPaxParts(booked)}
              {mixChanged ? ` → ${formatGuestPaxParts(next)}` : ''}
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <PaxStepper label="AD" value={adults} onChange={setAdults} />
              <PaxStepper label="CH" value={children} onChange={setChildren} />
              <PaxStepper label="INF" value={infants} onChange={setInfants} />
              <PaxStepper label="TL" value={tourLeaders} onChange={setTourLeaders} />
            </div>

            <div>
              <p className="mb-1.5 text-[11px] font-semibold tracking-wide text-teal-800/55 uppercase">
                Apply change to
              </p>
              <div className="grid gap-1.5">
                <ScopeChoice
                  active={scope === 'check-in'}
                  title="Check-in only"
                  hint="Marina board only. Original booking and invoice stay as booked."
                  onSelect={() => setScope('check-in')}
                />
                <ScopeChoice
                  active={scope === 'booking-invoice'}
                  title="Booking and invoice"
                  hint="Also update the agent booking, voucher remark, and invoice."
                  onSelect={() => setScope('booking-invoice')}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="pax-change-note" className="text-[11px]">
                Note{syncBooking ? '' : ' (optional)'}
              </Label>
              <Textarea
                id="pax-change-note"
                className="mt-1.5"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="e.g. Child is 12 — counted as adult"
              />
              <p className="mt-1 text-[11px] text-teal-900/45">
                {syncBooking
                  ? 'Required. Added to the agent booking note, guest voucher remark, and invoice.'
                  : 'Stays on the marina check-in note only.'}
              </p>
            </div>
            {error ? <p className="text-sm text-rose-700">{error}</p> : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={saving || !mixChanged} onClick={() => void save()}>
            {saving ? 'Saving…' : syncBooking ? 'Update booking & invoice' : 'Save check-in only'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ScopeChoice({
  active,
  title,
  hint,
  onSelect,
}: {
  active: boolean
  title: string
  hint: string
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'rounded-xl px-3 py-2.5 text-left ring-1 transition-colors',
        active
          ? 'bg-white text-teal-950 shadow-sm ring-teal-700/25'
          : 'bg-teal-950/[0.03] text-teal-900/70 ring-teal-900/10 hover:bg-white hover:text-teal-950',
      )}
    >
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-0.5 text-[11px] leading-snug text-teal-900/55">{hint}</p>
    </button>
  )
}

function PaxStepper({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
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
          disabled={value >= PAX_MAX}
          onClick={() => onChange(Math.min(PAX_MAX, value + 1))}
          aria-label={`Increase ${label}`}
        >
          <Plus className="size-3.5" />
        </button>
      </div>
    </div>
  )
}
