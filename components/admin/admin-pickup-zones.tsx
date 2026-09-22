'use client'

import { useMemo, useState } from 'react'
import { Building2, MapPin, Pencil, Plus, Trash2, Upload } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { PageHeader, Surface } from '@/components/ui-primitives'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { isCorePickupZone, type Hotel, type PickupZoneName } from '@/lib/types'

const UNASSIGNED = '__unassigned__'

export function AdminPickupZones() {
  const {
    zones,
    hotels,
    updateZoneTime,
    addZone,
    removeZone,
    addHotel,
    updateHotel,
    removeHotel,
    importHotelCatalog,
  } = usePortal()

  const [newName, setNewName] = useState('')
  const [newTime, setNewTime] = useState('08:00')
  const [zoneError, setZoneError] = useState('')

  const [hotelName, setHotelName] = useState('')
  const [hotelZone, setHotelZone] = useState<string>(UNASSIGNED)
  const [hotelExtraCharge, setHotelExtraCharge] = useState('')
  const [hotelError, setHotelError] = useState('')
  const [hotelFilter, setHotelFilter] = useState('')
  const [zoneFilter, setZoneFilter] = useState<string>('all')
  const [importMessage, setImportMessage] = useState('')

  const [editing, setEditing] = useState<Hotel | null>(null)
  const [editName, setEditName] = useState('')
  const [editZone, setEditZone] = useState<string>(UNASSIGNED)
  const [editExtraCharge, setEditExtraCharge] = useState('')
  const [editError, setEditError] = useState('')

  const assignableZones = useMemo(
    () => zones.filter((zone) => zone.name === 'Other' || !zone.pending),
    [zones],
  )

  const filteredHotels = useMemo(() => {
    const q = hotelFilter.trim().toLowerCase()
    return hotels
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((hotel) => {
        if (zoneFilter === 'unassigned' && hotel.zoneName) return false
        if (zoneFilter !== 'all' && zoneFilter !== 'unassigned' && hotel.zoneName !== zoneFilter) {
          return false
        }
        if (q && !hotel.name.toLowerCase().includes(q)) return false
        return true
      })
  }, [hotels, hotelFilter, zoneFilter])

  const unassignedCount = hotels.filter((hotel) => !hotel.zoneName).length

  function handleAddZone() {
    const result = addZone(newName, newTime)
    if (result) {
      setZoneError(result)
      return
    }
    setNewName('')
    setNewTime('08:00')
    setZoneError('')
  }

  function resolveZone(value: string): PickupZoneName | null {
    return value === UNASSIGNED ? null : value
  }

  function handleAddHotel() {
    const result = addHotel(hotelName, resolveZone(hotelZone), hotelExtraCharge)
    if (result) {
      setHotelError(result)
      return
    }
    setHotelName('')
    setHotelZone(UNASSIGNED)
    setHotelExtraCharge('')
    setHotelError('')
  }

  function openEdit(hotel: Hotel) {
    setEditing(hotel)
    setEditName(hotel.name)
    setEditZone(hotel.zoneName ?? UNASSIGNED)
    setEditExtraCharge(hotel.extraChargeTransfer)
    setEditError('')
  }

  function handleEditSave() {
    if (!editing) return
    const result = updateHotel(
      editing.id,
      editName,
      resolveZone(editZone),
      editExtraCharge,
    )
    if (result) {
      setEditError(result)
      return
    }
    setEditing(null)
  }

  function handleDeleteHotel(hotel: Hotel) {
    if (!window.confirm(`Remove ${hotel.name} from the hotel list?`)) return
    removeHotel(hotel.id)
  }

  return (
    <div className="w-full space-y-4">
      <PageHeader
        title="Pickup Zones"
        description="Set zone pickup times and manage the hotel catalog. Hotels missing from booking search can be added here with the correct zone and time."
      />

      <Surface className="divide-y divide-teal-900/6">
        {zones.map((zone) => {
          const custom = !isCorePickupZone(zone.name)
          const hotelCount = hotels.filter((hotel) => hotel.zoneName === zone.name).length
          return (
            <div key={zone.name} className="flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-2xl bg-teal-950/[0.05] text-teal-800">
                  <MapPin className="size-4" />
                </div>
                <div>
                  <div className="font-semibold text-teal-950">{zone.name}</div>
                  <div className="text-sm text-teal-900/50">
                    {zone.pending
                      ? 'Awaiting pickup time'
                      : custom
                        ? 'Custom pickup time'
                        : 'Predefined pickup time'}
                    <span className="text-teal-900/35"> · {hotelCount} hotels</span>
                  </div>
                </div>
              </div>
              {zone.pending ? (
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  Awaiting pickup time
                </div>
              ) : (
                <div className="flex items-end gap-2">
                  <div className="w-full max-w-[140px] space-y-1.5">
                    <Label htmlFor={`${zone.name}-time`} className="gday-soft-label">
                      Pickup time
                    </Label>
                    <Input
                      id={`${zone.name}-time`}
                      type="time"
                      value={zone.time}
                      onChange={(event) => updateZoneTime(zone.name, event.target.value)}
                    />
                  </div>
                  {custom ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-11 text-teal-900/40 hover:text-red-600"
                      aria-label={`Remove ${zone.name}`}
                      onClick={() => removeZone(zone.name)}
                    >
                      <Trash2 />
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
      </Surface>

      <Surface className="p-5">
        <h2 className="font-semibold text-teal-950">Add pickup zone</h2>
        <p className="mt-1 text-sm text-teal-900/50">
          New zones appear to agents with the pickup time you set here.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            handleAddZone()
          }}
        >
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="new-zone-name" className="gday-soft-label">
              Zone name
            </Label>
            <Input
              id="new-zone-name"
              value={newName}
              onChange={(event) => {
                setNewName(event.target.value)
                if (zoneError) setZoneError('')
              }}
            />
          </div>
          <div className="w-full max-w-[140px] space-y-1.5">
            <Label htmlFor="new-zone-time" className="gday-soft-label">
              Pickup time
            </Label>
            <Input
              id="new-zone-time"
              type="time"
              value={newTime}
              onChange={(event) => setNewTime(event.target.value)}
              className="h-10"
            />
          </div>
          <Button type="submit" className="h-10">
            <Plus data-icon="inline-start" />
            Add zone
          </Button>
        </form>
        {zoneError ? <p className="mt-3 text-sm text-red-600">{zoneError}</p> : null}
      </Surface>

      <Surface className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold text-teal-950">Hotels</h2>
            <p className="mt-1 text-sm text-teal-900/50">
              Add hotels here for agent typeahead. If a booking used Other with a custom name, add
              that hotel and assign zone (pickup time comes from the zone). Leave zone blank if
              unsure — assign later. Extra Charge Transfer is optional.
              {unassignedCount > 0 ? (
                <span className="font-medium text-amber-800">
                  {' '}
                  {unassignedCount} unassigned.
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10"
              onClick={() => {
                const result = importHotelCatalog()
                setImportMessage(
                  result.added === 0 && result.updated === 0
                    ? 'Catalog already up to date.'
                    : `Imported: ${result.added} added, ${result.updated} zones updated.`,
                )
              }}
            >
              <Upload data-icon="inline-start" />
              Import catalog
            </Button>
            <div className="flex size-10 items-center justify-center rounded-2xl bg-teal-950/[0.05] text-teal-800">
              <Building2 className="size-4" />
            </div>
          </div>
        </div>
        {importMessage ? (
          <p className="mt-3 text-sm text-teal-800">{importMessage}</p>
        ) : null}

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            handleAddHotel()
          }}
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="new-hotel-name" className="gday-soft-label">
                Hotel name
              </Label>
              <Input
                id="new-hotel-name"
                value={hotelName}
                onChange={(event) => {
                  setHotelName(event.target.value)
                  if (hotelError) setHotelError('')
                }}
              />
            </div>
            <div className="w-full sm:w-44 space-y-1.5">
              <Label className="gday-soft-label">Zone</Label>
              <Select
                value={hotelZone}
                onValueChange={(value) => setHotelZone(value ?? UNASSIGNED)}
              >
                <SelectTrigger className="h-10 w-full min-w-0">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {assignableZones.map((zone) => (
                    <SelectItem key={zone.name} value={zone.name}>
                      {zone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" className="h-10">
              <Plus data-icon="inline-start" />
              Add hotel
            </Button>
          </div>
          <div className="max-w-xl space-y-1.5">
            <Label htmlFor="new-hotel-extra" className="gday-soft-label">
              Extra Charge Transfer (price)
            </Label>
            <Input
              id="new-hotel-extra"
              value={hotelExtraCharge}
              onChange={(event) => {
                setHotelExtraCharge(event.target.value)
                if (hotelError) setHotelError('')
              }}
            />
            <p className="text-xs text-teal-900/45">
              Optional — leave blank if none. e.g. ฿500 / person. Shown on the agent voucher.
            </p>
          </div>
        </form>
        {hotelError ? <p className="mt-3 text-sm text-red-600">{hotelError}</p> : null}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Input
            value={hotelFilter}
            onChange={(event) => setHotelFilter(event.target.value)}
            placeholder="Search hotels…"
            className="h-10"
          />
          <Select value={zoneFilter} onValueChange={(value) => setZoneFilter(value ?? 'all')}>
            <SelectTrigger className="h-10 w-full sm:w-44">
              <SelectValue placeholder="All zones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All zones</SelectItem>
              <SelectItem value="unassigned">Unassigned</SelectItem>
              {assignableZones.map((zone) => (
                <SelectItem key={zone.name} value={zone.name}>
                  {zone.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 divide-y divide-teal-900/6 rounded-xl border border-teal-900/8">
          {filteredHotels.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-teal-900/45">
              {hotels.length === 0
                ? 'No hotels yet — add one above or import a list.'
                : 'No hotels match this filter.'}
            </p>
          ) : (
            filteredHotels.map((hotel) => (
              <div
                key={hotel.id}
                className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-teal-950">{hotel.name}</p>
                  <p className="text-sm text-teal-900/45">
                    {hotel.zoneName ?? 'Unassigned zone'}
                    {hotel.extraChargeTransfer.trim() ? (
                      <span className="text-amber-800"> · Extra Charge Transfer</span>
                    ) : null}
                  </p>
                  {hotel.extraChargeTransfer.trim() ? (
                    <p className="mt-1 line-clamp-2 text-xs text-teal-900/50">
                      {hotel.extraChargeTransfer.trim()}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9"
                    aria-label={`Edit ${hotel.name}`}
                    onClick={() => openEdit(hotel)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-9 text-teal-900/40 hover:text-red-600"
                    aria-label={`Remove ${hotel.name}`}
                    onClick={() => handleDeleteHotel(hotel)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </Surface>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit hotel</DialogTitle>
            <DialogDescription>
              Update the name, zone, or optional Extra Charge Transfer note for the agent voucher.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-hotel-name">Hotel name</Label>
              <Input
                id="edit-hotel-name"
                value={editName}
                onChange={(event) => {
                  setEditName(event.target.value)
                  if (editError) setEditError('')
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Zone</Label>
              <Select
                value={editZone}
                onValueChange={(value) => setEditZone(value ?? UNASSIGNED)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                  {assignableZones.map((zone) => (
                    <SelectItem key={zone.name} value={zone.name}>
                      {zone.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-extra-charge">Extra Charge Transfer (price)</Label>
              <Textarea
                id="edit-extra-charge"
                value={editExtraCharge}
                onChange={(event) => {
                  setEditExtraCharge(event.target.value)
                  if (editError) setEditError('')
                }}
                className="min-h-24"
              />
              <p className="text-xs text-teal-900/45">
                Optional — leave blank if none. Shown on the agent voucher when this hotel is booked.
              </p>
            </div>
            {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleEditSave}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
