'use client'

import { useMemo, useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { formatLongDate, formatShortDate, toISODate } from '@/lib/format'
import { DEFAULT_JB_CAPACITY, DEFAULT_PP_CAPACITY } from '@/lib/types'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DEFAULT_MONTH = new Date(2026, 8, 1)

type Tab = 'capacity' | 'status'

export function AdminAvailability() {
  const { getCapacity, bookedPaxFor, setCapacityForDates, nudgeCapacityForDates } = usePortal()
  const [tab, setTab] = useState<Tab>('capacity')
  const [month, setMonth] = useState(DEFAULT_MONTH)
  const [selected, setSelected] = useState<string[]>(['2026-09-17'])

  const days = useMemo(() => buildMonth(month), [month])
  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  const selectedSorted = useMemo(() => [...selected].sort(), [selected])
  const singleIso = selectedSorted.length === 1 ? selectedSorted[0] : null

  const sharedCapacity = useMemo(() => {
    if (selectedSorted.length === 0) return null
    const caps = selectedSorted.map((iso) => getCapacity(iso))
    const ppValues = new Set(caps.map((c) => c.ppCapacity))
    const jbValues = new Set(caps.map((c) => c.jamesBondCapacity))
    return {
      ppCapacity: ppValues.size === 1 ? [...ppValues][0] : null,
      jamesBondCapacity: jbValues.size === 1 ? [...jbValues][0] : null,
    }
  }, [selectedSorted, getCapacity])

  function toggleDay(iso: string) {
    setSelected((current) =>
      current.includes(iso) ? current.filter((d) => d !== iso) : [...current, iso],
    )
  }

  function selectOnly(iso: string) {
    setSelected([iso])
  }

  function bumpCapacity(program: 'PP' | 'James Bond', delta: number) {
    if (selectedSorted.length === 0) return
    nudgeCapacityForDates(selectedSorted, program, delta)
  }

  function setAbsoluteCapacity(program: 'PP' | 'James Bond', value: number) {
    if (selectedSorted.length === 0) return
    const key = program === 'PP' ? 'ppCapacity' : 'jamesBondCapacity'
    setCapacityForDates(selectedSorted, { [key]: Math.max(0, value) })
  }

  function selectWeekFromFirst() {
    const anchorIso =
      selectedSorted[0] ?? toISODate(new Date(month.getFullYear(), month.getMonth(), 1))
    const anchor = new Date(`${anchorIso}T12:00:00`)
    const next: string[] = []
    for (let i = 0; i < 7; i += 1) {
      next.push(
        toISODate(new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + i)),
      )
    }
    setSelected(next)
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Availability"
        description={`Default every day: PP ${DEFAULT_PP_CAPACITY} · James Bond ${DEFAULT_JB_CAPACITY}. Adjust per day or view live booking status.`}
      />

      <div className="mb-4 flex gap-1 rounded-xl border border-teal-900/8 bg-white/80 p-1">
        <TabButton active={tab === 'capacity'} onClick={() => setTab('capacity')}>
          Adjust capacity
        </TabButton>
        <TabButton active={tab === 'status'} onClick={() => setTab('status')}>
          Booking status
        </TabButton>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Surface className="p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight text-teal-950">{monthLabel}</h2>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>

          {tab === 'capacity' ? (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-teal-950/50">
                Click days to select. Use the panel to raise or lower seats.
              </p>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={selectWeekFromFirst}>
                  Next 7 days
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={selected.length === 0}
                  onClick={() => setSelected([])}
                >
                  Clear
                </Button>
              </div>
            </div>
          ) : (
            <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-teal-950/55">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-emerald-500" /> Available
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-rose-500" /> Booked
              </span>
            </div>
          )}

          <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-teal-900/10 bg-teal-900/10">
            {WEEKDAYS.map((day) => (
              <div
                key={day}
                className="bg-teal-50/80 px-1 py-2 text-center text-[10px] font-medium tracking-wide text-teal-700/45 uppercase sm:text-[11px]"
              >
                <span className="sm:hidden">{day.slice(0, 1)}</span>
                <span className="hidden sm:inline">{day}</span>
              </div>
            ))}

            {days.map((cell, index) => {
              if (!cell) {
                return <div key={`empty-${index}`} className="min-h-[88px] bg-white sm:min-h-[104px]" />
              }

              const iso = toISODate(cell)
              const capacity = getCapacity(iso)
              const ppBooked = bookedPaxFor(iso, 'PP')
              const jbBooked = bookedPaxFor(iso, 'James Bond')
              const ppLeft = Math.max(capacity.ppCapacity - ppBooked, 0)
              const jbLeft = Math.max(capacity.jamesBondCapacity - jbBooked, 0)
              const isSelected = selected.includes(iso)

              if (tab === 'capacity') {
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => toggleDay(iso)}
                    className={cn(
                      'min-h-[88px] bg-white p-1.5 text-left transition-colors hover:bg-teal-50/70 sm:min-h-[104px] sm:p-2',
                      isSelected && 'bg-teal-50 ring-1 ring-inset ring-teal-700',
                    )}
                  >
                    <div className="text-xs font-medium text-teal-900 sm:text-sm">{cell.getDate()}</div>
                    <div className="mt-1.5 space-y-1">
                      <CapacityChip label="PP" value={capacity.ppCapacity} />
                      <CapacityChip label="JB" value={capacity.jamesBondCapacity} />
                    </div>
                  </button>
                )
              }

              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => selectOnly(iso)}
                  className={cn(
                    'min-h-[88px] bg-white p-1.5 text-left transition-colors hover:bg-teal-50/70 sm:min-h-[104px] sm:p-2',
                    isSelected && selected.length === 1 && 'ring-1 ring-inset ring-teal-700',
                  )}
                >
                  <div className="text-xs font-medium text-teal-900 sm:text-sm">{cell.getDate()}</div>
                  <div className="mt-1.5 space-y-1">
                    <StatusChips label="PP" available={ppLeft} booked={ppBooked} />
                    <StatusChips label="JB" available={jbLeft} booked={jbBooked} />
                  </div>
                </button>
              )
            })}
          </div>
        </Surface>

        <Surface className="flex h-fit flex-col p-5">
          {tab === 'capacity' ? (
            <>
              <h2 className="text-sm font-semibold text-teal-950">Edit seats</h2>
              <p className="mt-1 text-xs text-teal-950/50">
                {selectedSorted.length === 0
                  ? 'Select one or more days on the calendar.'
                  : selectedSorted.length === 1
                    ? formatLongDate(selectedSorted[0])
                    : `${selectedSorted.length} days selected`}
              </p>

              {selectedSorted.length > 1 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedSorted.slice(0, 8).map((iso) => (
                    <span
                      key={iso}
                      className="rounded-md bg-teal-50 px-2 py-1 text-[11px] font-medium text-teal-800"
                    >
                      {formatShortDate(iso)}
                    </span>
                  ))}
                  {selectedSorted.length > 8 ? (
                    <span className="px-1 py-1 text-[11px] text-neutral-500">
                      +{selectedSorted.length - 8} more
                    </span>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-5 space-y-4">
                <StepperRow
                  name="PP"
                  value={sharedCapacity?.ppCapacity ?? null}
                  disabled={selectedSorted.length === 0}
                  onDecrement={() => bumpCapacity('PP', -1)}
                  onIncrement={() => bumpCapacity('PP', 1)}
                  onChange={(value) => setAbsoluteCapacity('PP', value)}
                />
                <StepperRow
                  name="James Bond"
                  value={sharedCapacity?.jamesBondCapacity ?? null}
                  disabled={selectedSorted.length === 0}
                  onDecrement={() => bumpCapacity('James Bond', -1)}
                  onIncrement={() => bumpCapacity('James Bond', 1)}
                  onChange={(value) => setAbsoluteCapacity('James Bond', value)}
                />
              </div>

              {selectedSorted.length > 1 &&
              (sharedCapacity?.ppCapacity === null || sharedCapacity?.jamesBondCapacity === null) ? (
                <p className="mt-4 text-xs leading-relaxed text-neutral-500">
                  Mixed values across selected days. +/- adjusts each day from its current number.
                </p>
              ) : null}
            </>
          ) : (
            <>
              <h2 className="text-sm font-semibold text-teal-950">Day status</h2>
              <p className="mt-1 text-xs text-teal-950/50">
                {singleIso ? formatLongDate(singleIso) : 'Click a day to inspect seats.'}
              </p>

              {singleIso ? (
                <div className="mt-5 space-y-3">
                  <StatusDetail
                    name="PP"
                    capacity={getCapacity(singleIso).ppCapacity}
                    booked={bookedPaxFor(singleIso, 'PP')}
                  />
                  <StatusDetail
                    name="James Bond"
                    capacity={getCapacity(singleIso).jamesBondCapacity}
                    booked={bookedPaxFor(singleIso, 'James Bond')}
                  />
                </div>
              ) : (
                <p className="mt-5 text-sm text-neutral-500">
                  Green is seats still open. Red is seats already booked.
                </p>
              )}
            </>
          )}
        </Surface>
      </div>
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex-1 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        active
          ? 'bg-teal-900 text-white shadow-sm'
          : 'text-teal-900/60 hover:bg-teal-50 hover:text-teal-950',
      )}
    >
      {children}
    </button>
  )
}

function CapacityChip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md bg-neutral-50 px-1.5 py-1 text-[10px] font-medium text-teal-900 sm:text-[11px]">
      {label} {value}
    </div>
  )
}

function StatusChips({
  label,
  available,
  booked,
}: {
  label: string
  available: number
  booked: number
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="w-5 shrink-0 text-[9px] font-medium text-teal-900/55 sm:text-[10px]">
        {label}
      </span>
      <span className="rounded-md bg-emerald-50 px-1 py-0.5 text-[9px] font-semibold text-emerald-700 sm:text-[10px]">
        {available}
      </span>
      <span className="rounded-md bg-rose-50 px-1 py-0.5 text-[9px] font-semibold text-rose-700 sm:text-[10px]">
        {booked}
      </span>
    </div>
  )
}

function StepperRow({
  name,
  value,
  disabled,
  onDecrement,
  onIncrement,
  onChange,
}: {
  name: string
  value: number | null
  disabled?: boolean
  onDecrement: () => void
  onIncrement: () => void
  onChange: (value: number) => void
}) {
  return (
    <div className="rounded-xl border border-teal-900/8 p-3">
      <div className="mb-2 text-sm font-medium text-teal-950">{name}</div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          disabled={disabled}
          onClick={onDecrement}
        >
          <Minus />
        </Button>
        <input
          type="number"
          min={0}
          disabled={disabled}
          value={value ?? ''}
          placeholder="Mixed"
          className="h-10 w-full rounded-lg border border-input bg-transparent px-2.5 text-center text-base font-semibold outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          onChange={(event) => {
            if (event.target.value === '') return
            onChange(Number(event.target.value) || 0)
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10 shrink-0"
          disabled={disabled}
          onClick={onIncrement}
        >
          <Plus />
        </Button>
      </div>
    </div>
  )
}

function StatusDetail({
  name,
  capacity,
  booked,
}: {
  name: string
  capacity: number
  booked: number
}) {
  const available = Math.max(capacity - booked, 0)
  return (
    <div className="rounded-xl border border-teal-900/8 p-3">
      <div className="mb-3 text-sm font-medium text-teal-950">{name}</div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-emerald-50 px-3 py-3 text-center">
          <div className="text-[10px] font-medium tracking-wide text-emerald-700/70 uppercase">
            Available
          </div>
          <div className="mt-1 text-xl font-semibold text-emerald-800">{available}</div>
        </div>
        <div className="rounded-lg bg-rose-50 px-3 py-3 text-center">
          <div className="text-[10px] font-medium tracking-wide text-rose-700/70 uppercase">
            Booked
          </div>
          <div className="mt-1 text-xl font-semibold text-rose-800">{booked}</div>
        </div>
      </div>
      <p className="mt-2 text-center text-[11px] text-neutral-500">Capacity {capacity}</p>
    </div>
  )
}

function buildMonth(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const cells: Array<Date | null> = Array.from({ length: first.getDay() }, () => null)
  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(new Date(month.getFullYear(), month.getMonth(), day))
  }
  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}
