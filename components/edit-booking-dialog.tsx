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
  isPrivateTransfer,
  NO_TRANSFER_ZONE,
  PRIVATE_TRANSFER_OPTIONS,
  PRIVATE_TRANSFER_ZONE,
  privateTransferPriceFor,
  totalPassengers,
  type Booking,
  type BookingActor,
  type Hotel,
  type IncludeOption,
  type PickupZoneName,
  type PrivateTransferVehicle,
} from '@/lib/types'
import { cn } from '@/lib/utils'

type TransferKind = 'none' | 'join' | 'private'

function toTimeInputValue(pickupTime: string) {
  const match = pickupTime.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return ''
  return `${match[1].padStart(2, '0')}:${match[2]}`
}

export function EditBookingDialog({
  booking,
  open,
  onOpenChange,
  bypassCutoff = false,
  actor,
  /** When true, open ready to add a transfer on a No Transfer booking. */
  startWithTransfer = false,
  /** Admin-only: allow Private Transfer with price + driver (billed to agent). */
  allowPrivateTransfer = false,
}: {
  booking: Booking | null
  open: boolean
  onOpenChange: (open: boolean) => void
  bypassCutoff?: boolean
  actor?: BookingActor
  startWithTransfer?: boolean
  allowPrivateTransfer?: boolean
}) {
  const { updateBookingDetails, hotels, zones, bookedPaxFor, getCapacity, getZoneTime } =
    usePortal()
  const [leadGuest, setLeadGuest] = useState('')
  const [adults, setAdults] = useState(0)
  const [children, setChildren] = useState(0)
  const [infants, setInfants] = useState(0)
  const [tourLeaders, setTourLeaders] = useState(0)
  const [transferKind, setTransferKind] = useState<TransferKind>('none')
  const [pickupZone, setPickupZone] = useState<PickupZoneName>(NO_TRANSFER_ZONE)
  const [pickupHotel, setPickupHotel] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [privatePickupTime, setPrivatePickupTime] = useState('')
  const [privateVehicle, setPrivateVehicle] = useState<PrivateTransferVehicle | ''>('')
  const [privateDriverName, setPrivateDriverName] = useState('')
  const [privateDriverPhone, setPrivateDriverPhone] = useState('')
  const [note, setNote] = useState('')
  const [cashOnTour, setCashOnTour] = useState('')
  const [agentRef, setAgentRef] = useState('')
  const [parkFee, setParkFee] = useState<IncludeOption>('Included')
  const [canoe, setCanoe] = useState<IncludeOption>('Included')
  const [error, setError] = useState('')

  const canUsePrivate = allowPrivateTransfer || bypassCutoff

  useEffect(() => {
    if (!open || !booking) return
    setLeadGuest(booking.leadGuest)
    setAdults(booking.adults)
    setChildren(booking.children)
    setInfants(booking.infants)
    setTourLeaders(booking.tourLeaders)

    const preferAdd = startWithTransfer && isNoTransfer(booking.pickupZone)
    const existingPrivate = isPrivateTransfer(booking)

    if (preferAdd) {
      setTransferKind('join')
      setPickupZone(zones[0]?.name ?? 'Other')
      setPickupHotel('')
      setRoomNumber('')
      setPrivatePickupTime('')
      setPrivateVehicle('')
      setPrivateDriverName('')
      setPrivateDriverPhone('')
    } else if (existingPrivate) {
      setTransferKind('private')
      setPickupZone(PRIVATE_TRANSFER_ZONE)
      setPickupHotel(booking.pickupHotel)
      setRoomNumber(booking.roomNumber)
      setPrivatePickupTime(toTimeInputValue(booking.pickupTime))
      setPrivateVehicle(booking.privateTransferVehicle || '')
      setPrivateDriverName(booking.privateDriverName)
      setPrivateDriverPhone(booking.privateDriverPhone)
    } else if (isNoTransfer(booking.pickupZone)) {
      setTransferKind('none')
      setPickupZone(NO_TRANSFER_ZONE)
      setPickupHotel('')
      setRoomNumber('')
      setPrivatePickupTime('')
      setPrivateVehicle('')
      setPrivateDriverName('')
      setPrivateDriverPhone('')
    } else {
      setTransferKind('join')
      setPickupZone(booking.pickupZone)
      setPickupHotel(booking.pickupHotel)
      setRoomNumber(booking.roomNumber)
      setPrivatePickupTime('')
      setPrivateVehicle('')
      setPrivateDriverName('')
      setPrivateDriverPhone('')
    }

    setNote(booking.note)
    setCashOnTour(booking.cashOnTour)
    setAgentRef(booking.agentRef)
    setParkFee(booking.parkFee)
    setCanoe(booking.canoe ?? 'Included')
    setError('')
  }, [open, booking, startWithTransfer, zones])

  const pax = adults + children + infants + tourLeaders
  const isJamesBond = booking?.program === 'James Bond'
  const noTransfer = transferKind === 'none'
  const isPrivate = transferKind === 'private'
  const selectedZone = zones.find((zone) => zone.name === pickupZone)
  const pendingPickup = transferKind === 'join' && (selectedZone?.pending ?? false)
  const joinPickupTime = transferKind === 'join' && pickupZone ? getZoneTime(pickupZone) : ''

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
    if (transferKind === 'private') {
      setError('')
      return
    }
    if (hotel.zoneName && zones.some((zone) => zone.name === hotel.zoneName)) {
      setPickupZone(hotel.zoneName)
    } else if (zones.some((zone) => zone.name === 'Other')) {
      setPickupZone('Other')
    }
    setError('')
  }

  function selectTransferKind(kind: TransferKind) {
    if (kind === 'private' && !canUsePrivate) return
    setTransferKind(kind)
    setError('')
    if (kind === 'none') {
      setPickupZone(NO_TRANSFER_ZONE)
      setPickupHotel('')
      setRoomNumber('')
      setPrivatePickupTime('')
      setPrivateVehicle('')
      setPrivateDriverName('')
      setPrivateDriverPhone('')
      return
    }
    if (kind === 'private') {
      setPickupZone(PRIVATE_TRANSFER_ZONE)
      if (!privateVehicle) setPrivateVehicle('Car')
      return
    }
    if (isNoTransfer(pickupZone) || isPrivateTransferZoneSafe(pickupZone)) {
      setPickupZone(zones[0]?.name ?? 'Other')
    }
    setPrivatePickupTime('')
    setPrivateVehicle('')
    setPrivateDriverName('')
    setPrivateDriverPhone('')
  }

  function handleSave() {
    if (!booking) return
    if (transferKind !== 'none' && !pickupHotel.trim()) {
      setError('Enter the pickup hotel.')
      return
    }
    if (transferKind === 'private') {
      if (!privateVehicle) {
        setError('Choose Car (1,400 THB) or Van (1,600 THB).')
        return
      }
      if (!privatePickupTime.trim()) {
        setError('Set the private transfer pickup time.')
        return
      }
    }

    const result = updateBookingDetails(
      booking.code,
      {
        leadGuest,
        adults,
        children,
        infants,
        tourLeaders,
        pickupZone:
          transferKind === 'none'
            ? NO_TRANSFER_ZONE
            : transferKind === 'private'
              ? PRIVATE_TRANSFER_ZONE
              : pickupZone,
        pickupHotel: transferKind === 'none' ? '' : pickupHotel,
        roomNumber: transferKind === 'none' ? '' : roomNumber,
        pickupTime: transferKind === 'private' ? privatePickupTime : undefined,
        privateTransferVehicle: transferKind === 'private' ? privateVehicle : '',
        privateTransferPrice:
          transferKind === 'private' && privateVehicle
            ? privateTransferPriceFor(privateVehicle)
            : '',
        privateDriverName: transferKind === 'private' ? privateDriverName : '',
        privateDriverPhone: transferKind === 'private' ? privateDriverPhone : '',
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

  const transferLockedPrivate = Boolean(
    booking && isPrivateTransfer(booking) && !canUsePrivate,
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{startWithTransfer ? 'Add transfer' : 'Edit booking'}</DialogTitle>
          <DialogDescription>
            {booking
              ? `${booking.code} · ${formatShortDate(booking.date)} · ${booking.program}`
              : null}
            {startWithTransfer
              ? '. Join shared vans, or book a Private transfer billed to the agent.'
              : null}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!startWithTransfer ? (
            <>
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
            </>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium">Transfer</p>
            {transferLockedPrivate ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50/80 px-4 py-3 text-sm text-teal-900/75">
                Private transfer is arranged by G&apos;day ops. Contact admin to change it.
              </div>
            ) : (
              <div
                className={cn(
                  'grid gap-3',
                  canUsePrivate ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-2',
                )}
              >
                <TransferKindButton
                  active={transferKind === 'join'}
                  onClick={() => selectTransferKind('join')}
                  label="Join Transfer"
                />
                {canUsePrivate ? (
                  <TransferKindButton
                    active={transferKind === 'private'}
                    onClick={() => selectTransferKind('private')}
                    label="Private Transfer"
                  />
                ) : null}
                <TransferKindButton
                  active={transferKind === 'none'}
                  onClick={() => selectTransferKind('none')}
                  label="No Transfer"
                />
              </div>
            )}
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

              {isPrivate ? (
                <>
                  <div>
                    <Label className="mb-2">Vehicle &amp; price (bill agent)</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {PRIVATE_TRANSFER_OPTIONS.map((option) => (
                        <button
                          key={option.vehicle}
                          type="button"
                          onClick={() => setPrivateVehicle(option.vehicle)}
                          className={cn(
                            'rounded-xl border px-3.5 py-3 text-left text-sm font-medium transition-colors',
                            privateVehicle === option.vehicle
                              ? 'border-teal-700 bg-teal-50 ring-1 ring-teal-700'
                              : 'border-teal-900/10 hover:border-teal-700/30',
                          )}
                        >
                          <span className="block text-teal-950">{option.vehicle}</span>
                          <span className="mt-0.5 block text-xs text-teal-900/55">
                            {option.priceThb.toLocaleString('en-US')} THB
                          </span>
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-teal-900/50">
                      Back office only — not shown on agent voucher. Bill the agent separately.
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="edit-private-pickup-time">Pickup time</Label>
                    <Input
                      id="edit-private-pickup-time"
                      type="time"
                      value={privatePickupTime}
                      onChange={(event) => setPrivatePickupTime(event.target.value)}
                      className="h-10"
                      required
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-private-driver">Driver name</Label>
                      <Input
                        id="edit-private-driver"
                        value={privateDriverName}
                        onChange={(event) => setPrivateDriverName(event.target.value)}
                        className="h-10"
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="edit-private-phone">Driver phone</Label>
                      <Input
                        id="edit-private-phone"
                        value={privateDriverPhone}
                        onChange={(event) => setPrivateDriverPhone(event.target.value)}
                        className="h-10"
                        placeholder="Optional"
                      />
                    </div>
                  </div>
                </>
              ) : (
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
              )}

              <div className="space-y-1.5">
                <Label htmlFor="edit-room">Room number</Label>
                <Input
                  id="edit-room"
                  value={roomNumber}
                  onChange={(event) => setRoomNumber(event.target.value)}
                  className="h-10"
                />
              </div>

              {!isPrivate && pendingPickup ? (
                <p className="text-xs text-amber-800">Pickup time: awaiting admin to set</p>
              ) : null}
              {!isPrivate && !pendingPickup && joinPickupTime ? (
                <p className="text-xs text-teal-900/55">
                  Pickup time for {pickupZone}:{' '}
                  <span className="font-semibold text-teal-950">{joinPickupTime}</span>
                </p>
              ) : null}
            </>
          )}

          {!startWithTransfer ? (
            <>
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
            </>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="edit-note-transfer">Note</Label>
              <Textarea
                id="edit-note-transfer"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                rows={2}
                placeholder="Optional ops note"
              />
            </div>
          )}

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={transferLockedPrivate && noTransfer}>
            {startWithTransfer ? 'Save transfer' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function isPrivateTransferZoneSafe(zone: string) {
  return zone.trim().toLowerCase() === PRIVATE_TRANSFER_ZONE.toLowerCase()
}

function TransferKindButton({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-4 py-3 text-sm font-medium transition-colors',
        active
          ? 'border-teal-800 bg-teal-800 text-white'
          : 'border-teal-900/10 text-teal-900/65 hover:border-teal-700/30',
      )}
    >
      {label}
    </button>
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
