'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
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
  driverContactLabel,
  driverNameKey,
  findDriver,
  pickRecentDrivers,
  RECENT_DRIVER_LIMIT,
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
  const { drivers, upsertDriver, removeDriver } = usePortal()
  const match = findDriver(drivers, value)
  const [recentTick, setRecentTick] = useState(0)
  const [showAll, setShowAll] = useState(false)
  const listDrivers = useMemo(
    () => pickRecentDrivers(drivers, { pinName: match?.name ?? value }),
    [drivers, match, value, recentTick],
  )
  const [addMode, setAddMode] = useState(() => !match && Boolean(value.trim()))
  const inputClass = size === 'sm' ? 'h-9' : 'h-10'
  const selectValue = addMode ? ADD_VALUE : (match?.name ?? undefined)
  const canSave = Boolean(value.trim())
  const manageable = showAll ? drivers : listDrivers
  const seenDriver = useRef<string | null>(null)
  const contactBaseline = useRef('')
  const driverKey = match?.name ?? ''
  if (seenDriver.current !== driverKey) {
    seenDriver.current = driverKey
    contactBaseline.current = `${driverKey}\0${phone.trim()}\0${plate.trim()}`
  }

  useEffect(() => {
    if (match) {
      setAddMode(false)
      return
    }
    if (value.trim()) setAddMode(true)
  }, [match, value])

  useEffect(() => {
    if (!match || addMode) return
    const phoneTrim = phone.trim()
    const plateTrim = plate.trim()
    const signature = `${match.name}\0${phoneTrim}\0${plateTrim}`
    const userEdited = signature !== contactBaseline.current
    const rosterPhone = match.phone.trim()
    const rosterPlate = match.plate.trim()
    const nextPhone = userEdited ? phoneTrim || rosterPhone : rosterPhone || phoneTrim
    const nextPlate = userEdited ? plateTrim || rosterPlate : rosterPlate || plateTrim
    if (nextPhone === rosterPhone && nextPlate === rosterPlate) return
    const handle = window.setTimeout(() => {
      upsertDriver({ name: match.name, phone: nextPhone, plate: nextPlate })
      recordRecentDriver(match.name)
      contactBaseline.current = `${match.name}\0${nextPhone}\0${nextPlate}`
      setRecentTick((tick) => tick + 1)
    }, 400)
    return () => window.clearTimeout(handle)
  }, [addMode, match, phone, plate, upsertDriver])

  function chooseDriver(driver: DriverRosterEntry) {
    const previous = findDriver(drivers, value)
    const switching =
      previous !== null && driverNameKey(previous.name) !== driverNameKey(driver.name)
    const entry = switching
      ? { name: driver.name, phone: driver.phone.trim(), plate: driver.plate.trim() }
      : {
          name: driver.name,
          phone: driver.phone.trim() || phone.trim(),
          plate: driver.plate.trim() || plate.trim(),
        }
    setAddMode(false)
    if (entry.phone !== driver.phone.trim() || entry.plate !== driver.plate.trim()) {
      upsertDriver(entry)
    }
    recordRecentDriver(entry.name)
    setRecentTick((tick) => tick + 1)
    onSelect(entry)
  }

  function deleteDriver(driver: DriverRosterEntry) {
    removeDriver(driver.name)
    setRecentTick((tick) => tick + 1)
    if (driverNameKey(value) === driverNameKey(driver.name)) {
      setAddMode(false)
      onNameChange('')
    }
  }

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
          chooseDriver(driver)
        }}
      >
        <SelectTrigger id={id} className={`${inputClass} w-full min-w-0`}>
          <SelectValue placeholder="Choose driver">
            {(selected: string | null) => {
              if (!selected) return 'Choose driver'
              if (selected === ADD_VALUE) return 'Add driver'
              return selected
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align="start" className="!w-80">
          <SelectItem value={ADD_VALUE}>Add driver</SelectItem>
          {listDrivers.map((driver) => (
            <SelectItem key={driver.name} value={driver.name}>
              <span className="flex min-w-0 flex-col items-start gap-0 py-0.5">
                <span>{driver.name}</span>
                <span className="text-[11px] font-normal text-teal-900/60">
                  {driverContactLabel(driver) || 'No telephone or plate yet'}
                </span>
              </span>
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
                phone: phone.trim() || existing?.phone || '',
                plate: plate.trim() || existing?.plate || '',
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
            Saves the name with the telephone and plate. The list keeps the last {RECENT_DRIVER_LIMIT}{' '}
            drivers.
          </p>
        </div>
      ) : null}
      {drivers.length > 0 ? (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-semibold tracking-wide text-teal-800/55 uppercase">
              {showAll ? `All drivers (${drivers.length})` : `Last ${RECENT_DRIVER_LIMIT} drivers`}
            </p>
            {drivers.length > listDrivers.length ? (
              <button
                type="button"
                className="text-[10px] font-semibold text-teal-800 hover:text-teal-950"
                onClick={() => setShowAll((current) => !current)}
              >
                {showAll ? 'Last 7' : `All ${drivers.length}`}
              </button>
            ) : null}
          </div>
          <ul className="max-h-36 space-y-0.5 overflow-y-auto">
            {manageable.map((driver) => {
              const contact = driverContactLabel(driver)
              const selected = driverNameKey(driver.name) === driverNameKey(value)
              return (
                <li key={driver.name} className="flex items-start gap-1">
                  <button
                    type="button"
                    className={`min-w-0 flex-1 rounded px-1 py-0.5 text-left text-[11px] leading-tight hover:bg-teal-50 ${
                      selected ? 'bg-teal-50 font-semibold text-teal-950' : 'text-teal-950'
                    }`}
                    onClick={() => chooseDriver(driver)}
                  >
                    <span className="block truncate">{driver.name}</span>
                    <span className="block truncate text-teal-900/55">
                      {contact || 'No telephone or plate yet'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="mt-0.5 shrink-0 rounded px-1 text-sm leading-none text-rose-800/70 hover:bg-rose-50 hover:text-rose-900"
                    aria-label={`Remove ${driver.name}`}
                    onClick={() => deleteDriver(driver)}
                  >
                    ×
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <p className="text-[11px] text-teal-900/50">Add a driver to remember telephone and plate.</p>
      )}
    </div>
  )
}
