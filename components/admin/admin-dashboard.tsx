'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { StatusBadge } from '@/components/status-badge'
import { PageHeader, Segment, SegmentedControl, SoftLabel, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { formatLongDate, formatShortDate, toISODate } from '@/lib/format'
import { totalPassengers, type Booking, type Program } from '@/lib/types'
import { cn } from '@/lib/utils'

const TODAY = '2026-09-17'
const TODAY_MONTH = new Date(2026, 8, 1)
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

type RangeMode = 'today' | 'month'
type ProgramFilter = 'all' | Program

export function AdminDashboard() {
  const { bookings, agents } = usePortal()
  const [range, setRange] = useState<RangeMode>('today')
  const [month, setMonth] = useState(TODAY_MONTH)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [program, setProgram] = useState<ProgramFilter>('all')
  const [agentSlug, setAgentSlug] = useState('all')

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const agent of agents) map.set(agent.slug, agent.name)
    for (const booking of bookings) {
      if (!map.has(booking.agentSlug)) map.set(booking.agentSlug, booking.agentName)
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [agents, bookings])

  const monthBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        if (agentSlug !== 'all' && booking.agentSlug !== agentSlug) return false
        if (program !== 'all' && booking.program !== program) return false
        return inMonth(booking.date, month)
      }),
    [bookings, agentSlug, program, month],
  )

  const visible = useMemo(() => {
    const rows =
      range === 'today'
        ? bookings.filter((booking) => {
            if (agentSlug !== 'all' && booking.agentSlug !== agentSlug) return false
            if (program !== 'all' && booking.program !== program) return false
            return booking.date === TODAY
          })
        : selectedDay
          ? monthBookings.filter((booking) => booking.date === selectedDay)
          : monthBookings

    return [...rows].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))
  }, [bookings, range, agentSlug, program, selectedDay, monthBookings])

  const grouped = useMemo(() => groupByDate(visible), [visible])
  const byDate = useMemo(() => indexByDate(monthBookings), [monthBookings])
  const days = useMemo(() => buildMonth(month), [month])

  const totalPax = sumPax(visible)
  const ppPax = sumPax(visible.filter((booking) => booking.program === 'PP'))
  const jbPax = sumPax(visible.filter((booking) => booking.program === 'James Bond'))
  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const isCurrentMonth =
    month.getFullYear() === TODAY_MONTH.getFullYear() && month.getMonth() === TODAY_MONTH.getMonth()
  const periodLabel =
    range === 'today'
      ? formatShortDate(TODAY)
      : selectedDay
        ? formatLongDate(selectedDay)
        : monthLabel
  const programDetail =
    program === 'PP' ? 'Phi Phi Islands' : program === 'James Bond' ? 'Phang Nga Bay' : 'All programs'

  const cards = [
    {
      label: range === 'today' ? "Today's Bookings" : 'Bookings',
      value: String(visible.length),
      detail: periodLabel,
    },
    {
      label: range === 'today' ? "Today's Total Pax" : 'Total Pax',
      value: String(totalPax),
      detail: programDetail,
    },
    ...(program !== 'James Bond'
      ? [{ label: 'PP Pax', value: String(ppPax), detail: 'Phi Phi Islands' }]
      : []),
    ...(program !== 'PP'
      ? [{ label: 'James Bond Pax', value: String(jbPax), detail: 'Phang Nga Bay' }]
      : []),
  ]

  function changeMonth(delta: number) {
    setMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1))
    setSelectedDay(null)
  }

  function setRangeMode(next: RangeMode) {
    setRange(next)
    setSelectedDay(null)
    if (next === 'month') setMonth(TODAY_MONTH)
  }

  function toggleDay(iso: string) {
    setSelectedDay((current) => (current === iso ? null : iso))
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Wednesday, 17 September 2026"
        title="Dashboard"
        description="Today’s partner departures, or browse any month by agent and program. Prototype data only — no pricing."
      />

      <Surface className="mb-5 p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <SoftLabel>Period</SoftLabel>
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl>
                <Segment active={range === 'today'} onClick={() => setRangeMode('today')}>
                  Today
                </Segment>
                <Segment active={range === 'month'} onClick={() => setRangeMode('month')}>
                  Month
                </Segment>
              </SegmentedControl>
              {range === 'month' ? (
                <div className="flex items-center gap-1">
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => changeMonth(-1)}>
                    <ChevronLeft />
                  </Button>
                  <div className="min-w-[9.5rem] text-center text-sm font-semibold text-teal-950">
                    {monthLabel}
                  </div>
                  <Button type="button" variant="outline" size="icon-sm" onClick={() => changeMonth(1)}>
                    <ChevronRight />
                  </Button>
                  {!isCurrentMonth ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setMonth(TODAY_MONTH)
                        setSelectedDay(null)
                      }}
                    >
                      This month
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="space-y-2">
              <SoftLabel>Program</SoftLabel>
              <SegmentedControl>
                <Segment active={program === 'all'} onClick={() => setProgram('all')}>
                  All
                </Segment>
                <Segment active={program === 'PP'} onClick={() => setProgram('PP')}>
                  PP
                </Segment>
                <Segment active={program === 'James Bond'} onClick={() => setProgram('James Bond')}>
                  James Bond
                </Segment>
              </SegmentedControl>
            </div>
            <div className="space-y-2 sm:min-w-[220px]">
              <SoftLabel htmlFor="dashboard-agent">Agent</SoftLabel>
              <select
                id="dashboard-agent"
                value={agentSlug}
                onChange={(event) => setAgentSlug(event.target.value)}
                className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm text-teal-950 outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
              >
                <option value="all">All agents</option>
                {agentOptions.map(([slug, name]) => (
                  <option key={slug} value={slug}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </Surface>

      <div
        className={cn(
          'grid gap-3 sm:grid-cols-2 sm:gap-4',
          cards.length > 3 ? 'xl:grid-cols-4' : 'xl:grid-cols-3',
        )}
      >
        {cards.map((card, index) => {
          const highlighted = index === 0
          const body = (
            <>
              <p
                className={cn(
                  'text-[11px] font-semibold tracking-tight',
                  highlighted ? 'text-white/75' : 'text-teal-800/50',
                )}
              >
                {card.label}
              </p>
              <p
                className={cn(
                  'mt-3 font-display text-3xl font-semibold tracking-tight',
                  highlighted ? 'text-white' : 'text-teal-950',
                )}
              >
                {card.value}
              </p>
              <p className={cn('mt-2 text-sm', highlighted ? 'text-white/70' : 'text-teal-900/50')}>
                {card.detail}
              </p>
            </>
          )

          if (highlighted) {
            return (
              <div
                key={card.label}
                className="rounded-[1.35rem] bg-gradient-to-br from-teal-700 to-cyan-800 p-5 text-white shadow-[0_18px_40px_-28px_rgba(15,118,110,0.65)]"
              >
                {body}
              </div>
            )
          }

          return (
            <Surface key={card.label} className="p-5">
              {body}
            </Surface>
          )
        })}
      </div>

      {range === 'month' ? (
        <Surface className="mt-6 overflow-hidden p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display font-semibold text-teal-950">{monthLabel}</h2>
              <p className="text-sm text-teal-900/50">
                {selectedDay
                  ? `Showing ${formatLongDate(selectedDay)}. Click the day again to see the whole month.`
                  : 'Click a day to focus that departure date.'}
              </p>
            </div>
            {selectedDay ? (
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedDay(null)}>
                All days
              </Button>
            ) : null}
          </div>
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
                return <div key={`empty-${index}`} className="min-h-14 bg-white sm:min-h-[96px]" />
              }
              const iso = toISODate(cell)
              const dayBookings = byDate[iso] ?? []
              const pp = sumPax(dayBookings.filter((booking) => booking.program === 'PP'))
              const jb = sumPax(dayBookings.filter((booking) => booking.program === 'James Bond'))
              const isToday = iso === TODAY
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => toggleDay(iso)}
                  className={cn(
                    'min-h-14 bg-white p-1.5 text-left transition-colors hover:bg-teal-50/70 sm:min-h-[96px] sm:p-2',
                    selectedDay === iso && 'bg-teal-50 ring-1 ring-inset ring-teal-700',
                    isToday && selectedDay !== iso && 'bg-cyan-50/70',
                  )}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-xs font-medium text-teal-900 sm:text-sm">{cell.getDate()}</span>
                    {isToday ? (
                      <span className="rounded-full bg-teal-800 px-1.5 py-px text-[9px] font-medium text-white">
                        Today
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1.5 space-y-1">
                    {pp > 0 ? (
                      <div className="rounded-md bg-sky-50 px-1 py-0.5 text-[9px] font-medium text-sky-800 sm:px-1.5 sm:text-[11px]">
                        <span className="sm:hidden">PP {pp}</span>
                        <span className="hidden sm:inline">PP — {pp} Pax</span>
                      </div>
                    ) : null}
                    {jb > 0 ? (
                      <div className="rounded-md bg-amber-50 px-1 py-0.5 text-[9px] font-medium text-amber-800 sm:px-1.5 sm:text-[11px]">
                        <span className="sm:hidden">JB {jb}</span>
                        <span className="hidden sm:inline">James Bond — {jb} Pax</span>
                      </div>
                    ) : null}
                  </div>
                </button>
              )
            })}
          </div>
        </Surface>
      ) : null}

      <Surface className="mt-6 overflow-hidden">
        <div className="border-b border-teal-900/8 px-4 py-4 sm:px-5">
          <h2 className="font-display font-semibold text-teal-950">
            {range === 'today' ? 'Today’s departures' : selectedDay ? 'Selected day' : 'Monthly departures'}
          </h2>
          <p className="text-sm text-teal-900/50">
            {visible.length === 0
              ? 'No bookings match these filters.'
              : `${visible.length} booking${visible.length === 1 ? '' : 's'} · ${totalPax} pax · ${periodLabel}`}
          </p>
        </div>
        {visible.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-teal-900/45 sm:px-5">
            Try another agent, program, or month.
          </p>
        ) : (
          <div className="divide-y divide-teal-900/6">
            {grouped.map((group) => (
              <section key={group.date}>
                {range === 'month' && !selectedDay ? (
                  <div className="bg-teal-50/60 px-4 py-2 text-xs font-medium tracking-wide text-teal-800/70 uppercase sm:px-5">
                    {formatLongDate(group.date)} · {group.items.length} booking
                    {group.items.length === 1 ? '' : 's'} · {sumPax(group.items)} pax
                  </div>
                ) : null}
                {group.items.map((booking) => (
                  <BookingRow key={booking.code} booking={booking} />
                ))}
              </section>
            ))}
          </div>
        )}
      </Surface>
    </div>
  )
}

function BookingRow({ booking }: { booking: Booking }) {
  return (
    <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-teal-950">{booking.leadGuest}</span>
          <ProgramChip program={booking.program} />
        </div>
        <div className="mt-1 text-sm text-teal-900/50">
          {booking.code} · {booking.agentName}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-teal-900/50 sm:justify-end sm:text-right">
        <div>
          <div className="font-medium text-teal-950">{totalPassengers(booking)} pax</div>
          <div>
            {booking.pickupZone} · {booking.pickupTime}
          </div>
        </div>
        <StatusBadge status={booking.status} />
      </div>
    </div>
  )
}

function ProgramChip({ program }: { program: Program }) {
  return (
    <span
      className={cn(
        'rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
        program === 'PP' ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-800',
      )}
    >
      {program}
    </span>
  )
}

function inMonth(isoDate: string, month: Date) {
  const year = month.getFullYear()
  const monthPart = String(month.getMonth() + 1).padStart(2, '0')
  return isoDate.startsWith(`${year}-${monthPart}`)
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

function sumPax(bookings: Booking[]) {
  return bookings.reduce((sum, booking) => sum + totalPassengers(booking), 0)
}

function indexByDate(bookings: Booking[]) {
  const map: Record<string, Booking[]> = {}
  for (const booking of bookings) {
    ;(map[booking.date] ??= []).push(booking)
  }
  return map
}

function groupByDate(bookings: Booking[]) {
  const groups: { date: string; items: Booking[] }[] = []
  for (const booking of bookings) {
    const last = groups.at(-1)
    if (last?.date === booking.date) last.items.push(booking)
    else groups.push({ date: booking.date, items: [booking] })
  }
  return groups
}
