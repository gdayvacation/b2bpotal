'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePortal } from '@/components/portal-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  findDriver,
  pickRecentDrivers,
  recordRecentDriver,
  type DriverRosterEntry,
} from '@/lib/driver-roster'

const ADD_VALUE = '__add_driver__'

export function DriverNameField({
  id,
  value,
  phone,
  plate,
  onSelect,
  onNameChange,
  label = 'Driver name',
  size = 'default',
}: {
  id: string
  value: string
  phone: string
  plate: string
  onSelect: (entry: DriverRosterEntry) => void
  onNameChange: (name: string) => void
  label?: string
  size?: 'sm' | 'default'
}) {
  const { drivers, upsertDriver } = usePortal()
  const match = findDriver(drivers, value)
  const [recentTick, setRecentTick] = useState(0)
  const listDrivers = useMemo(
    () => pickRecentDrivers(drivers, { pinName: match?.name ?? value }),
    [drivers, match, value, recentTick],
  )
  const [addMode, setAddMode] = useState(() => !match && Boolean(value.trim()))
  const inputClass = size === 'sm' ? 'h-9' : 'h-10'
  const selectValue = addMode ? ADD_VALUE : (match?.name ?? undefined)
  const canSave = Boolean(value.trim())

  useEffect(() => {
    if (match) {
      setAddMode(false)
      return
    }
    if (value.trim()) setAddMode(true)
  }, [match, value])

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        value={selectValue}
        onValueChange={(next) => {
          if (!next || next === ADD_VALUE) {
            setAddMode(true)
            if (match) onNameChange('')
            return
          }
          const driver = findDriver(drivers, next)
          if (!driver) return
          setAddMode(false)
          recordRecentDriver(driver.name)
          setRecentTick((tick) => tick + 1)
          onSelect(driver)
        }}
      >
        <SelectTrigger id={id} className={`${inputClass} w-full min-w-0`}>
          <SelectValue placeholder="Choose driver" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ADD_VALUE}>Add driver</SelectItem>
          {listDrivers.map((driver) => (
            <SelectItem key={driver.name} value={driver.name}>
              {driver.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {addMode ? (
        <div className="space-y-1.5">
          <Input
            id={`${id}-new`}
            value={value}
            onChange={(event) => onNameChange(event.target.value)}
            placeholder="New driver name"
            className={inputClass}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full"
            disabled={!canSave}
            onClick={() => {
              const name = value.trim()
              if (!name) return
              const existing = findDriver(drivers, name)
              const entry = {
                name,
                phone: existing?.phone ?? '',
                plate: existing?.plate ?? '',
              }
              upsertDriver(entry)
              recordRecentDriver(name)
              setRecentTick((tick) => tick + 1)
              setAddMode(false)
              onSelect(entry)
            }}
          >
            Save driver
          </Button>
          <p className="text-[11px] text-teal-900/50">
            Saves the name only. Dropdown shows 5 drivers (recent first); full roster keeps phone and plate.
          </p>
        </div>
      ) : null}
    </div>
  )
}
