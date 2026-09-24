'use client'

import { useEffect, useState } from 'react'
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
  isSpecialTransfer,
  isSpecialTransferKind,
  normalizeChargeAmount,
  type SpecialTransferKind,
  type VanMeta,
} from '@/lib/types'

export type SpecialTransferDraft = {
  specialKind: SpecialTransferKind
  transferIn: boolean
  transferOut: boolean
  driver: string
  phone: string
  plate: string
  company: string
  chargeAmount: number
}

export function specialTransferFromMeta(meta?: Partial<VanMeta> | null): SpecialTransferDraft {
  return {
    specialKind: isSpecialTransferKind(meta?.specialKind) ? meta.specialKind : 'private',
    transferIn: meta?.transferIn === true,
    transferOut: meta?.transferOut === true,
    driver: meta?.driver ?? '',
    phone: meta?.phone ?? '',
    plate: meta?.plate ?? '',
    company: meta?.outsourceCompany ?? '',
    chargeAmount: normalizeChargeAmount(meta?.chargeAmount),
  }
}

export function specialTransferToMeta(draft: SpecialTransferDraft): Partial<VanMeta> {
  const company = draft.company.trim()
  return {
    specialKind: draft.specialKind,
    transferIn: draft.transferIn,
    transferOut: draft.transferOut,
    driver: draft.driver.trim(),
    phone: draft.phone.trim(),
    plate: draft.plate.trim(),
    outsourced: company.length > 0,
    outsourceCompany: company,
    chargeAmount: normalizeChargeAmount(draft.chargeAmount),
  }
}

export function SpecialTransferDialog({
  open,
  van,
  initial,
  onOpenChange,
  onSave,
  onRemove,
}: {
  open: boolean
  van: number | null
  initial?: Partial<VanMeta> | null
  onOpenChange: (open: boolean) => void
  onSave: (draft: SpecialTransferDraft) => void
  onRemove?: () => void
}) {
  const [kind, setKind] = useState<SpecialTransferKind>('private')
  const [transferIn, setTransferIn] = useState(true)
  const [transferOut, setTransferOut] = useState(false)
  const [driver, setDriver] = useState('')
  const [phone, setPhone] = useState('')
  const [plate, setPlate] = useState('')
  const [company, setCompany] = useState('')
  const [charge, setCharge] = useState('')
  const existing = isSpecialTransfer(initial)

  useEffect(() => {
    if (!open) return
    const draft = specialTransferFromMeta(initial)
    setKind(draft.specialKind)
    setTransferIn(draft.transferIn || (!draft.transferOut && !existing))
    setTransferOut(draft.transferOut)
    setDriver(draft.driver)
    setPhone(draft.phone)
    setPlate(draft.plate)
    setCompany(draft.company)
    setCharge(draft.chargeAmount > 0 ? String(draft.chargeAmount) : '')
  }, [open, initial, existing])

  function handleSave() {
    onSave({
      specialKind: kind,
      transferIn,
      transferOut,
      driver,
      phone,
      plate,
      company,
      chargeAmount: normalizeChargeAmount(charge),
    })
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="pr-8 font-display text-xl font-semibold text-teal-950">
            {existing ? 'Edit special transfer' : 'Special transfer'}
            {van !== null ? ` · Van ${van}` : ''}
          </DialogTitle>
          <DialogDescription className="text-sm text-teal-900/55">
            Private van or other service — Transfer In, Transfer Out, or both. Charge shows on the
            VAN monthly report.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <SegmentedControl>
              <Segment active={kind === 'private'} onClick={() => setKind('private')}>
                Private Van
              </Segment>
              <Segment active={kind === 'other'} onClick={() => setKind('other')}>
                Other Service
              </Segment>
            </SegmentedControl>
          </div>

          <div className="space-y-1.5">
            <Label>Transfer</Label>
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
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <DriverNameField
              id="special-driver"
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
              <Label htmlFor="special-phone">Telephone</Label>
              <Input
                id="special-phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="e.g. 081-234-5678"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="special-plate">Plate number</Label>
              <Input
                id="special-plate"
                value={plate}
                onChange={(event) => setPlate(event.target.value)}
                placeholder="e.g. 31-7558"
                className="h-10"
              />
            </div>
            <OutsourceCompanyField
              id="special-company"
              label="Company"
              value={company}
              onChange={setCompany}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="special-charge">Charge amount</Label>
            <div className="relative">
              <Input
                id="special-charge"
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

        <DialogFooter className="mt-2 gap-2 sm:justify-between">
          {existing && onRemove ? (
            <Button
              type="button"
              variant="ghost"
              className="text-rose-800 hover:bg-rose-50 hover:text-rose-900"
              onClick={() => {
                onRemove()
                onOpenChange(false)
              }}
            >
              Remove special
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={van === null}>
              Save special transfer
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
