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
  NO_TRANSFER_ZONE,
  totalPassengers,
  type Booking,
  type BookingActor,
  type Hotel,
  type IncludeOption,
  type PickupZoneName,
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
  const { updateBookingDetails, hotels, zones, bookedPaxFor, getCapacity, getZoneTime } =
    usePortal()
  const [leadGuest, setLeadGuest] = useState('')
  const [adults, setAdults] = useState(0)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)
  const [tourLeaders, setTourLeaders] = useState(0)
  const [pickupZone, setPickupZone] = useState<PickupZoneName>(NO_TRANSFER_ZONE)
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
    setPickupZone(booking.pickupZone)
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
  const noTransfer = isNoTransfer(pickupZone)
  const selectedZone = zones.find((zone) => zone.name === pickupZone)
  const pendingPickup = !noTransfer && (selectedZone?.pending ?? false)
  const pickupTime = !noTransfer && pickupZone ? getZoneTime(pickupZone) : ''

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

  function applyHotelSelection(hotel: Hotel) {
    setPickupHotel(hotel.name)
    if (hotel.zoneName && zones.some((zone) => zone.name === hotel.zoneName)) {
      setPickupZone(hotel.zoneName)
    } else if (zones.some((zone) => zone.name === 'Other')) {
      setPickupZone('Other')
    }
    setError('')
  }

  function setTransferMode(withTransfer: boolean) {
    if (withTransfer) {
      if (isNoTransfer(pickupZone)) {
        setPickupZone(zones[0]?.name ?? 'Other')
      }
      return
    }
    setPickupZone(NO_TRANSFER_ZONE)
    setPickupHotel('')
    setRoomNumber('')
  }

  function handleSave() {
    if (!booking) return
    if (!noTransfer && !pickupHotel.trim()) {
      setError('Enter the pickup hotel.')
      return
    }
    const result = updateBookingDetails(
      booking.code,
      {
        leadGuest,
        adults,
        children,
        infants,
        tourLeaders,
        pickupZone,
        pickupHotel: noTransfer ? '' : pickupHotel,
        roomNumber: noTransfer ? '' : roomNumber,
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
            <Label htmlFor="edit-lead-guest">Guest Name</Label>
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

          <div>
            <p className="mb-2 text-sm font-medium">Transfer</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTransferMode(true)}
                className={cn(
                  'rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
                  !noTransfer
                    ? 'border-teal-800 bg-teal-800 text-white'
                    : 'border-teal-900/10 text-teal-900/65 hover:border-teal-700/30',
                )}
              >
                With transfer
              </button>
              <button
                type="button"
                onClick={() => setTransferMode(false)}
                className={cn(
                  'rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
                  noTransfer
                    ? 'border-teal-800 bg-teal-800 text-white'
                    : 'border-teal-900/10 text-teal-900/65 hover:border-teal-700/30',
                )}
              >
                No Transfer
              </button>
            </div>
          </div>

          {noTransfer ? (
            <div className="rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-3 text-sm text-teal-900/75">
              Guest arranges their own transport. Hotel and room are not required.
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Hotel</Label>
                <HotelCombobox
                  id="edit-hotel"
                  hotels={hotels}
                  value={pickupHotel}
                  onChange={setPickupHotel}
                  onSelectHotel={applyHotelSelection}
                />
              </div>

              <div>
                <Label className="mb-2">Pickup zone</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {zones.map((zone) => (
                    <button
                      key={zone.name}
                      type="button"
                      onClick={() => setPickupZone(zone.name)}
                      className={cn(
                        'rounded-xl border px-3.5 py-2.5 text-left text-sm font-medium transition-colors',
                        pickupZone === zone.name
                          ? 'border-teal-700 bg-teal-50 ring-1 ring-teal-700'
                          : 'border-teal-900/10 hover:border-teal-700/30',
                      )}
                    >
                      <span className="block truncate text-teal-950">{zone.name}</span>
                      <span className="mt-0.5 block text-xs text-teal-900/50">
                        {zone.pending ? 'Awaiting time' : getZoneTime(zone.name)}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-room">Room number</Label>
                <Input
                  id="edit-room"
                  value={roomNumber}
                  onChange={(event) => setRoomNumber(event.target.value)}
                  className="h-10"
                />
              </div>

              {pendingPickup ? (
                <p className="text-xs text-amber-800">Pickup time: awaiting admin to set</p>
              ) : pickupTime ? (
                <p className="text-xs text-teal-900/55">
                  Pickup time for {pickupZone}:{' '}
                  <span className="font-semibold text-teal-950">{pickupTime}</span>
                </p>
              ) : null}
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-agent-ref">Voucher Number</Label>
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
