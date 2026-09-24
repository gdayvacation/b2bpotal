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
import { DriverNameField } from '@/components/driver-name-field'
import { OutsourceCompanyField } from '@/components/outsource-company-field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Segment, SegmentedControl } from '@/components/ui-primitives'
import {
  DEFAULT_VAN_CAPACITY,
  MAX_VAN_CAPACITY,
  MIN_VAN_CAPACITY,
  clampVanCapacity,
  isSpecialTransfer,
  isSpecialTransferKind,
  normalizeChargeAmount,
  vanSeatCapacity,
  type Program,
  type SpecialTransferKind,
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
  const [outsourced, setOutsourced] = useState(false)
  const [outsourceCompany, setOutsourceCompany] = useState('')
  const [special, setSpecial] = useState(false)
  const [specialKind, setSpecialKind] = useState<SpecialTransferKind>('private')
  const [transferIn, setTransferIn] = useState(false)
  const [transferOut, setTransferOut] = useState(false)
  const [charge, setCharge] = useState('')

  useEffect(() => {
    if (!open || van === null) return
    const plan = getDayVehiclePlan(date, program)
    const dayMeta = plan.vanMeta[String(van)]
    const resolved = resolveVanMeta(van, dayMeta ?? null)
    setDriver(initial?.driver ?? resolved.driver)
    setPhone(initial?.phone ?? resolved.phone)
    setPlate(initial?.plate ?? resolved.plate)
    setSeats(vanSeatCapacity(plan, van))
    setOutsourced(initial?.outsourced ?? resolved.outsourced === true)
    setOutsourceCompany(initial?.outsourceCompany ?? resolved.outsourceCompany ?? '')
    const kind = initial?.specialKind ?? resolved.specialKind
    setSpecial(isSpecialTransfer({ specialKind: kind }) || isSpecialTransfer(resolved))
    setSpecialKind(isSpecialTransferKind(kind) ? kind : 'private')
    setTransferIn(initial?.transferIn ?? resolved.transferIn === true)
    setTransferOut(initial?.transferOut ?? resolved.transferOut === true)
    const amount = normalizeChargeAmount(initial?.chargeAmount ?? resolved.chargeAmount)
    setCharge(amount > 0 ? String(amount) : '')
  }, [open, van, date, program, initial, getDayVehiclePlan, resolveVanMeta])

  function handleSave() {
    if (van === null) return
    setVanMeta(date, program, van, {
      driver: driver.trim(),
      phone: phone.trim(),
      plate: plate.trim(),
      capacity: clampVanCapacity(seats),
      outsourced,
      outsourceCompany: outsourced ? outsourceCompany.trim() : '',
      specialKind: special ? specialKind : null,
      transferIn: special ? transferIn : false,
      transferOut: special ? transferOut : false,
      chargeAmount: special ? normalizeChargeAmount(charge) : 0,
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{van !== null ? `Van ${van} details` : 'Van details'}</DialogTitle>
          <DialogDescription>
            Driver, plate, and phone apply to this day only. The next day starts blank. Seat count
            is also only for this day.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <DriverNameField
            id="van-driver-name"
            value={driver}
            phone={phone}
            plate={plate}
            onSelect={(entry) => {
              setDriver(entry.name)
              setPhone(entry.phone)
              setPlate(entry.plate)
            }}
            onNameChange={setDriver}
          />
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
          <label className="flex items-center gap-2 text-sm font-medium text-teal-950">
            <input
              type="checkbox"
              className="size-3.5 rounded border-teal-900/25 text-violet-700"
              checked={outsourced}
              onChange={(event) => {
                setOutsourced(event.target.checked)
                if (!event.target.checked) setOutsourceCompany('')
              }}
            />
            Outsource van company
          </label>
          {outsourced ? (
            <OutsourceCompanyField
              id="van-outsource-company"
              value={outsourceCompany}
              onChange={setOutsourceCompany}
            />
          ) : null}
          <label className="flex items-center gap-2 text-sm font-medium text-teal-950">
            <input
              type="checkbox"
              className="size-3.5 rounded border-teal-900/25 text-sky-700"
              checked={special}
              onChange={(event) => {
                setSpecial(event.target.checked)
                if (event.target.checked && !transferIn && !transferOut) setTransferIn(true)
              }}
            />
            Special transfer
          </label>
          {special ? (
            <div className="space-y-3 rounded-xl border border-sky-200 bg-sky-50/60 p-3">
              <SegmentedControl>
                <Segment active={specialKind === 'private'} onClick={() => setSpecialKind('private')}>
                  Private Van
                </Segment>
                <Segment active={specialKind === 'other'} onClick={() => setSpecialKind('other')}>
                  Other Service
                </Segment>
              </SegmentedControl>
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-teal-950">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-teal-900/25 text-teal-700"
                    checked={transferIn}
                    onChange={(event) => setTransferIn(event.target.checked)}
                  />
                  Transfer In
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-teal-950">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-teal-900/25 text-teal-700"
                    checked={transferOut}
                    onChange={(event) => setTransferOut(event.target.checked)}
                  />
                  Transfer Out
                </label>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="van-special-charge">Charge amount</Label>
                <div className="relative">
                  <Input
                    id="van-special-charge"
                    type="number"
                    min={0}
                    step={100}
                    value={charge}
                    onChange={(event) => setCharge(event.target.value)}
                    placeholder="e.g. 2500"
                    className="h-10 pr-14"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs font-semibold text-teal-800/55">
                    THB
                  </span>
                </div>
              </div>
            </div>
          ) : null}
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
