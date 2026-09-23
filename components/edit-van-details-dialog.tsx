'use client'

import { useEffect, useState } from 'react'
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
import {
  DEFAULT_VAN_CAPACITY,
  MAX_VAN_CAPACITY,
  MIN_VAN_CAPACITY,
  clampVanCapacity,
  vanSeatCapacity,
  type Program,
  type VanMeta,
} from '@/lib/types'

export function EditVanDetailsDialog({
  open,
  onOpenChange,
  date,
  program,
  van,
  initial,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  date: string
  program: Program
  van: number | null
  initial?: Partial<VanMeta> | null
}) {
  const { setVanMeta, resolveVanMeta, getDayVehiclePlan } = usePortal()
  const [driver, setDriver] = useState('')
  const [phone, setPhone] = useState('')
  const [plate, setPlate] = useState('')
  const [seats, setSeats] = useState(DEFAULT_VAN_CAPACITY)

  useEffect(() => {
    if (!open || van === null) return
    const plan = getDayVehiclePlan(date, program)
    const dayMeta = plan.vanMeta[String(van)]
    const resolved = resolveVanMeta(van, dayMeta ?? null)
    setDriver(initial?.driver ?? resolved.driver)
    setPhone(initial?.phone ?? resolved.phone)
    setPlate(initial?.plate ?? resolved.plate)
    setSeats(vanSeatCapacity(plan, van))
  }, [open, van, date, program, initial, getDayVehiclePlan, resolveVanMeta])

  function handleSave() {
    if (van === null) return
    setVanMeta(date, program, van, {
      driver: driver.trim(),
      phone: phone.trim(),
      plate: plate.trim(),
      capacity: clampVanCapacity(seats),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{van !== null ? `Van ${van} details` : 'Van details'}</DialogTitle>
          <DialogDescription>
            Driver, plate, and phone are remembered for the next day. Seat count is only for this
            day.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="van-driver-name">Driver name</Label>
            <Input
              id="van-driver-name"
              value={driver}
              onChange={(event) => setDriver(event.target.value)}
              placeholder="e.g. Somchai"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="van-driver-phone">Telephone</Label>
            <Input
              id="van-driver-phone"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              placeholder="e.g. 081-234-5678"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="van-plate">Plate number</Label>
            <Input
              id="van-plate"
              value={plate}
              onChange={(event) => setPlate(event.target.value)}
              placeholder="e.g. กข 4521"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="van-seats-today">Seats today</Label>
            <Input
              id="van-seats-today"
              type="number"
              min={MIN_VAN_CAPACITY}
              max={MAX_VAN_CAPACITY}
              value={seats}
              onChange={(event) => setSeats(clampVanCapacity(Number(event.target.value)))}
              className="h-10"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={van === null}>
            Save van details
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
