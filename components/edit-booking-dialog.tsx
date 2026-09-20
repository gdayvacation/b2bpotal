'use client'

import { useEffect, useMemo, useState } from 'react'
import { HotelCombobox } from '@/components/hotel-combobox'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatShortDate } from '@/lib/format'
import {
  isNoTransfer,
  totalPassengers,
  type Booking,
  type BookingActor,
  type IncludeOption,
} from '@/lib/types'
import { cn } from '@/lib/utils'

export function EditBookingDialog({
  booking,
  open,
  onOpenChange,
  bypassCutoff = false,
  actor,
}: {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
  bypassCutoff?: boolean
  actor?: BookingActor
}) {
  const { updateBookingDetails, hotels, bookedPaxFor, getCapacity } = usePortal()
  const [leadGuest, setLeadGuest] = useState('')
  const [adults, setAdults] = useState(0)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)
  const [tourLeaders, setTourLeaders] = useState(0)
  const [pickupHotel, setPickupHotel] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [note, setNote] = useState('')
  const [cashOnTour, setCashOnTour] = useState('')
  const [agentRef, setAgentRef] = useState('')
  const [parkFee, setParkFee] = useState<IncludeOption>('Included')
  const [canoe, setCanoe] = useState<IncludeOption>('Included')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open || !booking) return
    setLeadGuest(booking.leadGuest)
    setAdults(booking.adults)
    setChildren(booking.children)
    setInfants(booking.infants)
    setTourLeaders(booking.tourLeaders)
    setPickupHotel(booking.pickupHotel)
    setRoomNumber(booking.roomNumber)
    setNote(booking.note)
    setCashOnTour(booking.cashOnTour)
    setAgentRef(booking.agentRef)
    setParkFee(booking.parkFee)
    setCanoe(booking.canoe ?? 'Included')
    setError('')
  }, [open, booking])

  const pax = adults + children + infants + tourLeaders
  const isJamesBond = booking?.program === 'James Bond'
  const seatsHint = useMemo(() => {
    if (!booking) return null
    const caps = getCapacity(booking.date)
    const capacity =
      booking.program === 'PP' ? caps.ppCapacity : caps.jamesBondCapacity
    const booked = bookedPaxFor(booking.date, booking.program)
    const current = totalPassengers(booking)
    const seatsLeft = Math.max(0, capacity - booked + current)
    return { capacity, seatsLeft }
  }, [booking, getCapacity, bookedPaxFor])

  function handleSave() {
    if (!booking) return
    const result = updateBookingDetails(
      booking.code,
      {
        leadGuest,
        adults,
        children,
        infants,
        tourLeaders,
        pickupHotel,
        roomNumber,
        note,
        cashOnTour,
        agentRef,
        parkFee,
        canoe: booking.program === 'James Bond' ? canoe : null,
      },
      { bypassCutoff, actor },
    )
    if (!result.ok) {
      setError(result.error)
      return
    }
    onOpenChange(false)
  }

  const noTransfer = booking ? isNoTransfer(booking.pickupZone) : false

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit booking</DialogTitle>
          <DialogDescription>
            {booking
              ? `${booking.code} · ${formatShortDate(booking.date)} · ${booking.program}`
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-lead-guest">Lead guest</Label>
            <Input
              id="edit-lead-guest"
              value={leadGuest}
              onChange={(event) => setLeadGuest(event.target.value)}
              className="h-10"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <NumberField label="Adults" value={adults} onChange={setAdults} />
            <NumberField label="Children" value={children} onChange={setChildren} />
            <NumberField label="Infants" value={infants} onChange={setInfants} />
            <NumberField label="TL" value={tourLeaders} onChange={setTourLeaders} />
          </div>
          {seatsHint ? (
            <p className="text-xs text-teal-900/50">
              {pax} pax total · up to {seatsHint.seatsLeft} seats available on this date
              (capacity {seatsHint.capacity})
            </p>
          ) : null}

          {!noTransfer ? (
            <div className="space-y-1.5">
              <Label>Hotel</Label>
              <HotelCombobox
                id="edit-hotel"
                hotels={hotels}
                value={pickupHotel}
                onChange={setPickupHotel}
                onSelectHotel={(hotel) => setPickupHotel(hotel.name)}
              />
            </div>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {!noTransfer ? (
              <div className="space-y-1.5">
                <Label htmlFor="edit-room">Room number</Label>
                <Input
                  id="edit-room"
                  value={roomNumber}
                  onChange={(event) => setRoomNumber(event.target.value)}
                  className="h-10"
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="edit-agent-ref">Agent ref</Label>
              <Input
                id="edit-agent-ref"
                value={agentRef}
                onChange={(event) => setAgentRef(event.target.value)}
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-cash-on-tour">Cash on tour</Label>
              <Input
                id="edit-cash-on-tour"
                value={cashOnTour}
                onChange={(event) => setCashOnTour(event.target.value)}
                className="h-10"
                placeholder="e.g. 2,000 THB"
              />
            </div>
          </div>

          <IncludeOptionGroup title="Park fee" value={parkFee} onChange={setParkFee} />
          {isJamesBond ? (
            <IncludeOptionGroup title="Canoe" value={canoe} onChange={setCanoe} />
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="edit-note">Note</Label>
            <Textarea
              id="edit-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function IncludeOptionGroup({
  title,
  value,
  onChange,
}: {
  title: string
  value: IncludeOption
  onChange: (value: IncludeOption) => void
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="grid grid-cols-2 gap-3">
        {(['Included', 'Not Included'] as IncludeOption[]).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              'rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
              value === option
                ? 'border-teal-800 bg-teal-800 text-white'
                : 'border-teal-900/10 text-teal-900/65 hover:border-teal-700/30',
            )}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (value: number) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(event) => onChange(Math.max(0, Number(event.target.value) || 0))}
        className="h-10"
      />
    </div>
  )
}
