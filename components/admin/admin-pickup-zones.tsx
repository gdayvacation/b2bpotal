'use client'

import { useState } from 'react'
import { MapPin, Plus, Trash2 } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { isCorePickupZone } from '@/lib/types'

export function AdminPickupZones() {
  const { zones, updateZoneTime, addZone, removeZone } = usePortal()
  const [newName, setNewName] = useState('')
  const [newTime, setNewTime] = useState('08:00')
  const [error, setError] = useState('')

  function handleAdd() {
    const result = addZone(newName, newTime)
    if (result) {
      setError(result)
      return
    }
    setNewName('')
    setNewTime('08:00')
    setError('')
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Pickup Zones"
        description="Set times shown to agents. Add extra zones anytime. Other stays pending confirmation."
      />
      <Surface className="divide-y divide-teal-900/6">
        {zones.map((zone) => {
          const custom = !isCorePickupZone(zone.name)
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
                      ? 'Pending Confirmation'
                      : custom
                        ? 'Custom pickup time'
                        : 'Predefined pickup time'}
                  </div>
                </div>
              </div>
              {zone.pending ? (
                <div className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                  Pending Confirmation
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

      <Surface className="mt-4 p-5">
        <h2 className="font-semibold text-teal-950">Add pickup zone</h2>
        <p className="mt-1 text-sm text-teal-900/50">
          New zones appear to agents with the pickup time you set here.
        </p>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(event) => {
            event.preventDefault()
            handleAdd()
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
                if (error) setError('')
              }}
              placeholder="Kamala"
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
        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </Surface>
    </div>
  )
}
