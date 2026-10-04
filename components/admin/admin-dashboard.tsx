'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { StatusBadge } from '@/components/status-badge'
import { PageHeader, Segment, SegmentedControl, SoftLabel, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { addDaysISO, formatLongDate, formatShortDate, startOfThisMonth, todayISO, toISODate } from '@/lib/format'
import { fetchBookingsInDateRange } from '@/lib/supabase/portal-db'
import { usePortalTodayISO } from '@/lib/use-portal-today'
import { totalPassengers, isActiveBooking, type Booking, type Program } from '@/lib/types'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

type RangeMode = 'today' | 'month' | 'year'
type ProgramFilter = 'all' | Program

type AgentRank = {
  slug: string
  name: string
  bookings: number
  pax: number
  pp: number
  jb: number
}

type SeriesPoint = {
  key: string
  label: string
  bookings: number
  pax: number
  pp: number
  jb: number
  accent?: boolean
}

export function AdminDashboard() {
  const { bookings: liveBookings, agents } = usePortal()
  const [range, setRange] = useState<RangeMode>('today')
  const [month, setMonth] = useState(() => startOfThisMonth())
  const [year, setYear] = useState(() => Number(todayISO().slice(0, 4)))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [program, setProgram] = useState<ProgramFilter>('all')
  const [agentSlug, setAgentSlug] = useState('all')
  /** Month/year rows for charts. Today uses the portal window already in memory. */
  const [historyBookings, setHistoryBookings] = useState<Booking[] | null>(null)
  const [priorYearBookings, setPriorYearBookings] = useState<Booking[] | null>(null)
  const historyCacheRef = useRef(new Map<string, Booking[]>())
  const today = usePortalTodayISO()
  const thisMonth = startOfThisMonth()
  const thisYear = Number(today.slice(0, 4))

  useEffect(() => {
    if (range === 'today') return

    let cancelled = false
    const cache = historyCacheRef.current

    async function loadRange(key: string, from: string, to: string) {
      const cached = cache.get(key)
      if (cached) return cached
      const rows = await fetchBookingsInDateRange(from, to)
      cache.set(key, rows)
      return rows
    }

    ;(async () => {
      try {
        if (range === 'month') {
          const y = month.getFullYear()
          const m = String(month.getMonth() + 1).padStart(2, '0')
          const monthKey = `month:${y}-${m}`
          const yearRows = cache.get(`year:${y}`)
          if (yearRows) {
            if (!cancelled) setHistoryBookings(yearRows)
            return
          }
          const cachedMonth = cache.get(monthKey)
          if (cachedMonth) {
            if (!cancelled) setHistoryBookings(cachedMonth)
            return
          }
          setHistoryBookings(null)
          const last = new Date(y, month.getMonth() + 1, 0).getDate()
          const rows = await loadRange(
            monthKey,
            `${y}-${m}-01`,
            `${y}-${m}-${String(last).padStart(2, '0')}`,
          )
          if (!cancelled) setHistoryBookings(rows)
          return
        }

        const yearKey = `year:${year}`
        const priorKey = `year:${year - 1}`
        const cachedYear = cache.get(yearKey) ?? null
        const cachedPrior = cache.get(priorKey) ?? null
        setHistoryBookings(cachedYear)
        setPriorYearBookings(cachedPrior)
        if (cachedYear && cachedPrior) return

        if (!cachedYear) {
          const rows = await loadRange(yearKey, `${year}-01-01`, `${year}-12-31`)
          if (cancelled) return
          setHistoryBookings(rows)
        }
        if (!cachedPrior) {
          const rows = await loadRange(priorKey, `${year - 1}-01-01`, `${year - 1}-12-31`)
          if (!cancelled) setPriorYearBookings(rows)
        }
      } catch (error) {
        console.error('[dashboard] history load failed', error)
        if (!cancelled) {
          setHistoryBookings((current) => current ?? [])
          setPriorYearBookings((current) => current ?? [])
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [range, year, month])

  const historyPending = range !== 'today' && historyBookings === null
  const priorPending = range === 'year' && priorYearBookings === null
  const bookings = range === 'today' ? liveBookings : (historyBookings ?? [])

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const agent of agents) map.set(agent.slug, agent.name)
    for (const booking of bookings) {
      const slug = booking.agentSlug?.trim()
      if (!slug || map.has(slug)) continue
      map.set(slug, booking.agentName?.trim() || slug)
    }
    return [...map.entries()].sort((a, b) =>
      (a[1] || a[0]).localeCompare(b[1] || b[0]),
    )
  }, [agents, bookings])

  const filtered = useMemo(
    () =>
      bookings.filter((booking) => {
        if (agentSlug !== 'all' && booking.agentSlug !== agentSlug) return false
        if (program !== 'all' && booking.program !== program) return false
        return true
      }),
    [bookings, agentSlug, program],
  )

  const periodBookings = useMemo(() => {
    if (range === 'today') return filtered.filter((booking) => booking.date === today)
    if (range === 'month') {
      const inView = filtered.filter((booking) => inMonth(booking.date, month))
      return selectedDay ? inView.filter((booking) => booking.date === selectedDay) : inView
    }
    return filtered.filter((booking) => inYear(booking.date, year))
  }, [filtered, range, today, month, selectedDay, year])

  const yearBookings = useMemo(
    () => (range === 'year' ? filtered.filter((booking) => inYear(booking.date, year)) : []),
    [filtered, range, year],
  )
  const lastYearBookings = useMemo(() => {
    if (range !== 'year' || !priorYearBookings) return []
    return priorYearBookings.filter((booking) => {
      if (agentSlug !== 'all' && booking.agentSlug !== agentSlug) return false
      if (program !== 'all' && booking.program !== program) return false
      return inYear(booking.date, year - 1)
    })
  }, [priorYearBookings, range, agentSlug, program, year])

  const visible = useMemo(
    () => [...periodBookings].sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code)),
    [periodBookings],
  )
  const grouped = useMemo(() => groupByDate(visible), [visible])
  const monthDays = useMemo(
    () => filtered.filter((booking) => inMonth(booking.date, month)),
    [filtered, month],
  )
  const byDate = useMemo(() => indexByDate(monthDays), [monthDays])
  const days = useMemo(() => buildMonth(month), [month])

  const stats = summarize(visible)
  const yearStats = summarize(yearBookings)
  const lastYearStats = summarize(lastYearBookings)
  const yoy = yoyChange(yearStats.pax, lastYearStats.pax)

  const nearbyBookings = useMemo(() => {
    if (range !== 'today') return []
    const from = addDaysISO(today, -2)
    const to = addDaysISO(today, 2)
    return filtered.filter((booking) => booking.date >= from && booking.date <= to)
  }, [filtered, range, today])

  const chartSeries = useMemo(() => {
    if (range === 'month') return dailySeries(monthDays, month)
    if (range === 'today') return nearbyDaySeries(filtered, today)
    return monthlySeries(yearBookings, year)
  }, [range, monthDays, month, filtered, today, yearBookings, year])

  const topAgents = useMemo(() => rankAgents(range === 'year' ? yearBookings : visible), [range, yearBookings, visible])
  const topAgent = topAgents[0] ?? null

  const monthLabel = month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
  const isCurrentMonth =
    month.getFullYear() === thisMonth.getFullYear() && month.getMonth() === thisMonth.getMonth()
  const isCurrentYear = year === thisYear
  const periodLabel =
    range === 'today'
      ? formatShortDate(today)
      : range === 'year'
        ? String(year)
        : selectedDay
          ? formatLongDate(selectedDay)
          : monthLabel
  const programDetail =
    program === 'PP' ? 'Phi Phi Islands' : program === 'James Bond' ? 'Phang Nga Bay' : 'All programs'
  const chartSummary = range === 'today' ? summarize(nearbyBookings) : stats
  const chartTitle =
    range === 'month'
      ? `Daily pax · ${monthLabel}`
      : range === 'today'
        ? `Pax · ${formatDayTick(addDaysISO(today, -2))} – ${formatDayTick(addDaysISO(today, 2))}`
        : `Monthly pax · ${year}`

  const countLabel = (value: number) => (historyPending ? '…' : formatCount(value))
  const kpis = [
    {
      label: range === 'today' ? 'Today bookings' : range === 'year' ? `${year} bookings` : 'Bookings',
      value: countLabel(stats.bookings),
      detail: historyPending ? 'Loading…' : periodLabel,
      tone: 'hero' as const,
    },
    {
      label: range === 'today' ? 'Today pax' : range === 'year' ? `${year} pax` : 'Total pax',
      value: countLabel(stats.pax),
      detail: historyPending ? 'Loading…' : programDetail,
      tone: 'sky' as const,
    },
    {
      label: `${year} vs ${year - 1}`,
      value:
        range !== 'year'
          ? '—'
          : historyPending || priorPending
            ? '…'
            : yoy == null
              ? '—'
              : `${yoy > 0 ? '+' : ''}${yoy}%`,
      detail:
        range !== 'year'
          ? 'Open Year to compare'
          : historyPending || priorPending
            ? 'Loading last year…'
            : lastYearStats.pax > 0
              ? `${formatCount(yearStats.pax)} pax this year`
              : `No ${year - 1} data yet`,
      tone: 'teal' as const,
    },
    {
      label: 'Top agent',
      value: historyPending ? '…' : topAgent ? truncate(topAgent.name, 16) : '—',
      detail: historyPending
        ? 'Loading…'
        : topAgent
          ? `${formatCount(topAgent.bookings)} bookings · ${formatCount(topAgent.pax)} pax`
          : 'No bookings in this view',
      tone: 'amber' as const,
    },
  ]

  function applyMonth(next: Date) {
    const y = next.getFullYear()
    const m = String(next.getMonth() + 1).padStart(2, '0')
    const cached =
      historyCacheRef.current.get(`year:${y}`) ??
      historyCacheRef.current.get(`month:${y}-${m}`) ??
      null
    setHistoryBookings(cached)
    setMonth(next)
    setSelectedDay(null)
  }

  function applyYear(next: number) {
    setHistoryBookings(historyCacheRef.current.get(`year:${next}`) ?? null)
    setPriorYearBookings(historyCacheRef.current.get(`year:${next - 1}`) ?? null)
    setYear(next)
  }

  function changeMonth(delta: number) {
    applyMonth(new Date(month.getFullYear(), month.getMonth() + delta, 1))
  }

  function setRangeMode(next: RangeMode) {
    setRange(next)
    setSelectedDay(null)
    if (next === 'month') applyMonth(startOfThisMonth())
    if (next === 'year') applyYear(thisYear)
  }

  function toggleDay(iso: string) {
    setSelectedDay((current) => (current === iso ? null : iso))
  }

  return (
    <div className="w-full">
      <PageHeader
        eyebrow={formatLongDate(today)}
        title="Dashboard"
        description="Today’s totals and top agents — open Month or Year when you need a wider view."
      />

      <Surface className="mb-3 px-3 py-2 sm:mb-4 sm:px-3.5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <SoftLabel className="hidden sm:block">Period</SoftLabel>
            <SegmentedControl className="rounded-xl p-0.5">
              <Segment
                className="rounded-lg px-2.5 py-1 text-xs"
                active={range === 'today'}
                onClick={() => setRangeMode('today')}
              >
                Today
              </Segment>
              <Segment
                className="rounded-lg px-2.5 py-1 text-xs"
                active={range === 'month'}
                onClick={() => setRangeMode('month')}
              >
                Month
              </Segment>
              <Segment
                className="rounded-lg px-2.5 py-1 text-xs"
                active={range === 'year'}
                onClick={() => setRangeMode('year')}
              >
                Year
              </Segment>
            </SegmentedControl>
            {range === 'month' ? (
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  onClick={() => changeMonth(-1)}
                  aria-label="Previous month"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <p className="min-w-[7.5rem] text-center text-xs font-semibold tabular-nums text-teal-950">
                  {monthLabel}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  onClick={() => changeMonth(1)}
                  aria-label="Next month"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
                {!isCurrentMonth ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => applyMonth(startOfThisMonth())}
                  >
                    Now
                  </Button>
                ) : null}
              </div>
            ) : null}
            {range === 'year' ? (
              <div className="flex items-center gap-0.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  onClick={() => applyYear(year - 1)}
                  aria-label="Previous year"
                >
                  <ChevronLeft className="size-3.5" />
                </Button>
                <p className="min-w-[3.5rem] text-center text-xs font-semibold tabular-nums text-teal-950">
                  {year}
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="size-7"
                  onClick={() => applyYear(year + 1)}
                  aria-label="Next year"
                >
                  <ChevronRight className="size-3.5" />
                </Button>
                {!isCurrentYear ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => applyYear(thisYear)}
                  >
                    Now
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          <span className="hidden h-4 w-px bg-teal-900/10 sm:block" />

          <div className="flex items-center gap-1.5">
            <SoftLabel>Program</SoftLabel>
            <SegmentedControl className="rounded-xl p-0.5">
              <Segment
                className="rounded-lg px-2.5 py-1 text-xs"
                active={program === 'all'}
                onClick={() => setProgram('all')}
              >
                All
              </Segment>
              <Segment
                className="rounded-lg px-2.5 py-1 text-xs"
                active={program === 'PP'}
                onClick={() => setProgram('PP')}
              >
                PP
              </Segment>
              <Segment
                className="rounded-lg px-2.5 py-1 text-xs"
                active={program === 'James Bond'}
                onClick={() => setProgram('James Bond')}
              >
                JB
              </Segment>
            </SegmentedControl>
          </div>

          <select
            id="dashboard-agent"
            aria-label="Agent"
            value={agentSlug}
            onChange={(event) => setAgentSlug(event.target.value)}
            className="h-8 min-w-[10rem] flex-1 rounded-lg border border-teal-900/12 bg-white/80 px-2 text-xs text-teal-950 outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15 sm:ml-auto sm:max-w-[16rem] sm:flex-none"
          >
            <option value="all">All agents</option>
            {agentOptions.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </Surface>

      <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4 sm:gap-3">
        {kpis.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1.45fr)_minmax(18rem,1fr)]">
        <Surface className="p-3.5 sm:p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold text-teal-950">{chartTitle}</h2>
              <p className="text-[12px] text-teal-900/50">
                {historyPending
                  ? 'Loading…'
                  : `${formatCount(chartSummary.bookings)} bookings · ${formatCount(chartSummary.pax)} pax`}
                {!historyPending && program !== 'all' ? ` · ${programDetail}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-medium text-teal-900/55">
              {program !== 'James Bond' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-sky-500" />
                  PP
                </span>
              ) : null}
              {program !== 'PP' ? (
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-amber-400" />
                  JB
                </span>
              ) : null}
            </div>
          </div>
          {historyPending ? (
            <p className="py-16 text-center text-sm text-teal-900/45">
              Loading {range === 'month' ? 'this month' : 'this year'}…
            </p>
          ) : (
            <VolumeChart points={chartSeries} showPp={program !== 'James Bond'} showJb={program !== 'PP'} />
          )}
        </Surface>

        <Surface className="p-3.5 sm:p-4">
          <div className="mb-3">
            <h2 className="font-display text-base font-semibold text-teal-950">Top agents</h2>
            <p className="text-[12px] text-teal-900/50">By pax in this view</p>
          </div>
          {historyPending ? (
            <p className="py-8 text-center text-sm text-teal-900/45">Loading agents…</p>
          ) : topAgents.length === 0 ? (
            <p className="py-8 text-center text-sm text-teal-900/45">No agent volume yet.</p>
          ) : (
            <ol className="space-y-2">
              {topAgents.slice(0, 8).map((agent, index) => {
                const max = topAgents[0]?.pax || 1
                return (
                  <li key={agent.slug}>
                    <button
                      type="button"
                      className={cn(
                        'w-full rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-teal-50/80',
                        agentSlug === agent.slug && 'bg-teal-50',
                      )}
                      onClick={() => setAgentSlug(agent.slug === agentSlug ? 'all' : agent.slug)}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="min-w-0 truncate text-[13px] font-medium text-teal-950">
                          <span className="mr-1.5 tabular-nums text-teal-900/35">{index + 1}</span>
                          {agent.name}
                        </p>
                        <p className="shrink-0 text-[12px] tabular-nums text-teal-900/70">
                          {formatCount(agent.pax)}
                        </p>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-teal-950/[0.06]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-teal-600 to-cyan-500"
                          style={{ width: `${Math.max(6, (agent.pax / max) * 100)}%` }}
                        />
                      </div>
                      <p className="mt-0.5 text-[10px] text-teal-900/40">
                        {formatCount(agent.bookings)} bookings
                        {program === 'all' ? ` · PP ${formatCount(agent.pp)} · JB ${formatCount(agent.jb)}` : ''}
                      </p>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
        </Surface>
      </div>

      {program === 'all' && !historyPending ? (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <ProgramMixCard label="Phi Phi" program="PP" pax={stats.pp} total={stats.pax} />
          <ProgramMixCard label="James Bond" program="James Bond" pax={stats.jb} total={stats.pax} />
        </div>
      ) : null}

      {range === 'month' && !historyPending ? (
        <Surface className="mt-3 overflow-hidden p-4 sm:p-5">
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
              const isToday = iso === today
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

      {historyPending ? (
        <Surface className="mt-3 overflow-hidden">
          <div className="px-4 py-10 text-center text-sm text-teal-900/45 sm:px-5">
            Loading {range === 'month' ? 'this month' : `${year}`}…
          </div>
        </Surface>
      ) : range === 'month' ? (
        <Surface className="mt-3 overflow-hidden">
          <div className="border-b border-teal-900/8 px-3.5 py-3 sm:px-5 sm:py-4">
            <h2 className="font-display font-semibold text-teal-950">
              {selectedDay ? 'Selected day' : 'Monthly departures'}
            </h2>
            <p className="text-sm text-teal-900/50">
              {visible.length === 0
                ? 'No bookings match these filters.'
                : `${visible.length} booking${visible.length === 1 ? '' : 's'} · ${stats.pax} pax · ${periodLabel}`}
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
      ) : range === 'year' ? (
        <Surface className="mt-3 overflow-hidden">
          <div className="border-b border-teal-900/8 px-3.5 py-3 sm:px-5 sm:py-4">
            <h2 className="font-display font-semibold text-teal-950">{year} by month</h2>
            <p className="text-sm text-teal-900/50">
              {yearStats.bookings === 0
                ? 'No bookings in this year for these filters.'
                : `${formatCount(yearStats.bookings)} bookings · ${formatCount(yearStats.pax)} pax`}
            </p>
          </div>
          <div className="divide-y divide-teal-900/6">
            {chartSeries.map((point) => (
              <div
                key={point.key}
                className="flex items-center gap-3 px-3.5 py-2.5 sm:px-5"
              >
                <p className="w-10 shrink-0 text-sm font-medium text-teal-950">{point.label}</p>
                <div className="min-w-0 flex-1">
                  <div className="flex h-2 overflow-hidden rounded-full bg-teal-950/[0.06]">
                    {point.pp > 0 ? (
                      <div
                        className="h-full bg-sky-500"
                        style={{ width: `${(point.pp / Math.max(point.pax, 1)) * 100}%` }}
                      />
                    ) : null}
                    {point.jb > 0 ? (
                      <div
                        className="h-full bg-amber-400"
                        style={{ width: `${(point.jb / Math.max(point.pax, 1)) * 100}%` }}
                      />
                    ) : null}
                  </div>
                </div>
                <p className="w-[7.5rem] shrink-0 text-right text-[12px] tabular-nums text-teal-900/65">
                  {formatCount(point.bookings)} · {formatCount(point.pax)} pax
                </p>
              </div>
            ))}
          </div>
        </Surface>
      ) : null}
    </div>
  )
}

function KpiCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string
  value: string
  detail: string
  tone: 'hero' | 'sky' | 'teal' | 'amber'
}) {
  if (tone === 'hero') {
    return (
      <div className="relative overflow-hidden rounded-[1.15rem] bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 p-3.5 text-white shadow-[0_18px_40px_-28px_rgba(15,118,110,0.65)] sm:p-4">
        <div className="pointer-events-none absolute -right-6 -top-6 size-24 rounded-full bg-sky-300/20 blur-2xl" />
        <p className="relative text-[11px] font-semibold tracking-tight text-white/75">{label}</p>
        <p className="relative mt-1.5 font-display text-2xl font-semibold tracking-tight text-white sm:text-[1.7rem]">
          {value}
        </p>
        <p className="relative mt-1.5 text-[12px] text-white/70">{detail}</p>
      </div>
    )
  }

  const styles = {
    sky: {
      wrap: 'bg-gradient-to-br from-sky-50/90 via-white to-white ring-1 ring-sky-200/50',
      label: 'text-sky-700/70',
      value: 'text-sky-950',
      detail: 'text-sky-800/55',
      bar: 'from-sky-400 to-cyan-500',
    },
    teal: {
      wrap: 'bg-gradient-to-br from-teal-50/90 via-white to-white ring-1 ring-teal-200/50',
      label: 'text-teal-700/70',
      value: 'text-teal-950',
      detail: 'text-teal-800/55',
      bar: 'from-teal-400 to-emerald-500',
    },
    amber: {
      wrap: 'bg-gradient-to-br from-amber-50/90 via-white to-white ring-1 ring-amber-200/50',
      label: 'text-amber-700/70',
      value: 'text-amber-950',
      detail: 'text-amber-800/55',
      bar: 'from-amber-400 to-orange-500',
    },
  }[tone]

  return (
    <div className={cn('rounded-[1.15rem] p-3.5 shadow-[0_12px_36px_-28px_rgba(11,36,34,0.28)] sm:p-4', styles.wrap)}>
      <div className={cn('mb-2.5 h-1 w-8 rounded-full bg-gradient-to-r', styles.bar)} />
      <p className={cn('text-[11px] font-semibold tracking-tight', styles.label)}>{label}</p>
      <p className={cn('mt-1.5 font-display text-2xl font-semibold tracking-tight sm:text-[1.7rem]', styles.value)}>
        {value}
      </p>
      <p className={cn('mt-1.5 truncate text-[12px]', styles.detail)}>{detail}</p>
    </div>
  )
}

function ProgramMixCard({
  label,
  program,
  pax,
  total,
}: {
  label: string
  program: Program
  pax: number
  total: number
}) {
  const pct = total > 0 ? Math.round((pax / total) * 100) : 0
  const pp = program === 'PP'
  return (
    <Surface className="p-3.5 sm:p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-tight text-teal-700/70">{label}</p>
        <p className="text-[12px] tabular-nums text-teal-900/45">{pct}%</p>
      </div>
      <p className="mt-1 font-display text-2xl font-semibold text-teal-950">{formatCount(pax)}</p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-teal-950/[0.06]">
        <div
          className={cn('h-full rounded-full', pp ? 'bg-sky-500' : 'bg-amber-400')}
          style={{ width: `${pct}%` }}
        />
      </div>
    </Surface>
  )
}

function VolumeChart({
  points,
  showPp,
  showJb,
}: {
  points: SeriesPoint[]
  showPp: boolean
  showJb: boolean
}) {
  const max = Math.max(...points.map((point) => point.pax), 1)
  const trend = points.map((point) => point.pax)
  return (
    <div>
      <div className="relative h-40 sm:h-44">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
          <TrendPath values={trend} max={max} />
        </svg>
        <div className="relative flex h-full items-end gap-1">
          {points.map((point) => {
            const height = (point.pax / max) * 100
            const ppShare = point.pax > 0 ? (point.pp / point.pax) * 100 : 0
            const jbShare = point.pax > 0 ? (point.jb / point.pax) * 100 : 0
            return (
              <div key={point.key} className="flex min-w-0 flex-1 flex-col items-center justify-end">
                <div
                  className={cn(
                    'flex w-full flex-col justify-end overflow-hidden rounded-t-md',
                    points.length <= 7 ? 'max-w-[4.5rem]' : 'max-w-[2.2rem]',
                    point.accent ? 'bg-teal-700/10 ring-1 ring-teal-700/25' : 'bg-teal-950/[0.04]',
                  )}
                  style={{ height: `${Math.max(height, point.pax > 0 ? 6 : 2)}%` }}
                  title={`${point.label}: ${point.pax} pax · ${point.bookings} bookings`}
                >
                  {showJb && jbShare > 0 ? (
                    <div className="w-full bg-amber-400" style={{ height: `${jbShare}%` }} />
                  ) : null}
                  {showPp && ppShare > 0 ? (
                    <div className="w-full bg-sky-500" style={{ height: `${ppShare}%` }} />
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-1.5 flex gap-1">
        {points.map((point) => (
          <span
            key={`${point.key}-label`}
            className={cn(
              'min-w-0 flex-1 truncate text-center text-[10px] tabular-nums',
              point.accent ? 'font-semibold text-teal-800' : 'text-teal-900/40',
            )}
          >
            {point.label}
          </span>
        ))}
      </div>
    </div>
  )
}

function TrendPath({ values, max }: { values: number[]; max: number }) {
  if (values.length === 0) return null
  const coords = values.map((value, index) => {
    const x = values.length === 1 ? 50 : (index / (values.length - 1)) * 100
    const y = 38 - (value / max) * 34
    return `${x},${y}`
  })
  const line = coords.join(' ')
  const area = `0,40 ${coords.join(' ')} 100,40`
  return (
    <>
      <polyline points={area} fill="rgba(13,148,136,0.10)" stroke="none" />
      <polyline
        points={line}
        fill="none"
        stroke="rgb(15,118,110)"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </>
  )
}

function BookingRow({ booking }: { booking: Booking }) {
  const cancelled = booking.status === 'Cancelled'
  return (
    <div className={cn(cancelled && 'bg-rose-50/60')}>
      <div className="space-y-2 px-3.5 py-3 sm:hidden">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              'min-w-0 truncate text-[15px] font-semibold',
              cancelled ? 'text-rose-800 line-through decoration-rose-300' : 'text-teal-950',
            )}
          >
            {booking.leadGuest}
          </p>
          <StatusBadge status={booking.status} />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <ProgramChip program={booking.program} />
          <span
            className={cn(
              'font-mono text-[12px]',
              cancelled ? 'text-rose-700/80' : 'text-teal-900/65',
            )}
          >
            {booking.code}
          </span>
          <span className="text-teal-900/25">·</span>
          <span
            className={cn(
              'text-sm font-medium tabular-nums',
              cancelled ? 'text-rose-800/70' : 'text-teal-950',
            )}
          >
            {totalPassengers(booking)} pax
          </span>
        </div>
        <p className="truncate text-xs text-teal-900/50">
          {booking.agentName}
          {booking.pickupHotel.trim() || booking.pickupZone
            ? ` · ${booking.pickupHotel.trim() || booking.pickupZone}`
            : ''}
          {booking.pickupTime ? ` · ${booking.pickupTime}` : ''}
        </p>
      </div>

      <div
        className={cn(
          'hidden items-center gap-x-4 px-5 py-2.5 md:grid',
          'grid-cols-[minmax(7rem,1fr)_5.75rem_minmax(0,1.5fr)_4.25rem_minmax(8rem,1fr)_7.75rem]',
        )}
      >
        <span
          className={cn(
            'truncate text-sm font-medium',
            cancelled ? 'text-rose-800 line-through decoration-rose-300' : 'text-teal-950',
          )}
        >
          {booking.leadGuest}
        </span>

        <ProgramChip program={booking.program} />

        <div className="min-w-0 truncate text-sm text-teal-900/45">
          <span
            className={cn(
              'font-mono text-[13px]',
              cancelled ? 'text-rose-700/80' : 'text-teal-900/65',
            )}
          >
            {booking.code}
          </span>
          <span className="mx-1.5 text-teal-900/25">·</span>
          {booking.agentName}
        </div>

        <span
          className={cn(
            'text-sm font-medium tabular-nums',
            cancelled ? 'text-rose-800/70' : 'text-teal-950',
          )}
        >
          {totalPassengers(booking)} pax
        </span>

        <span className="truncate text-sm tabular-nums text-teal-900/50">
          {booking.pickupZone} · {booking.pickupTime}
        </span>

        <div className="justify-self-end">
          <StatusBadge status={booking.status} />
        </div>
      </div>
    </div>
  )
}

function ProgramChip({ program }: { program: Program }) {
  return (
    <span
      className={cn(
        'inline-flex w-[5.75rem] justify-center rounded-full px-2 py-0.5 text-[11px] font-semibold',
        program === 'PP' ? 'bg-sky-50 text-sky-800' : 'bg-amber-50 text-amber-800',
      )}
    >
      {program}
    </span>
  )
}

function summarize(bookings: Booking[]) {
  let bookingsCount = 0
  let pax = 0
  let pp = 0
  let jb = 0
  for (const booking of bookings) {
    if (!isActiveBooking(booking)) continue
    bookingsCount += 1
    const heads = totalPassengers(booking)
    pax += heads
    if (booking.program === 'PP') pp += heads
    else jb += heads
  }
  return { bookings: bookingsCount, pax, pp, jb }
}

function rankAgents(bookings: Booking[]): AgentRank[] {
  const map = new Map<string, AgentRank>()
  for (const booking of bookings) {
    if (!isActiveBooking(booking)) continue
    const slug = booking.agentSlug || booking.agentName
    const current = map.get(slug) ?? {
      slug,
      name: booking.agentName || slug,
      bookings: 0,
      pax: 0,
      pp: 0,
      jb: 0,
    }
    const heads = totalPassengers(booking)
    current.bookings += 1
    current.pax += heads
    if (booking.program === 'PP') current.pp += heads
    else current.jb += heads
    map.set(slug, current)
  }
  return [...map.values()].sort((a, b) => b.pax - a.pax || b.bookings - a.bookings || a.name.localeCompare(b.name))
}

function nearbyDaySeries(bookings: Booking[], today: string): SeriesPoint[] {
  return [-2, -1, 0, 1, 2].map((offset) => {
    const iso = addDaysISO(today, offset)
    const stats = summarize(bookings.filter((booking) => booking.date === iso))
    return {
      key: iso,
      label: offset === 0 ? 'Today' : formatDayTick(iso),
      accent: offset === 0,
      ...stats,
    }
  })
}

function formatDayTick(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

function monthlySeries(bookings: Booking[], year: number): SeriesPoint[] {
  return MONTH_SHORT.map((label, index) => {
    const prefix = `${year}-${String(index + 1).padStart(2, '0')}`
    const rows = bookings.filter((booking) => booking.date.startsWith(prefix))
    const stats = summarize(rows)
    return { key: prefix, label, ...stats }
  })
}

function dailySeries(bookings: Booking[], month: Date): SeriesPoint[] {
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`
  return Array.from({ length: last }, (_, index) => {
    const day = String(index + 1).padStart(2, '0')
    const iso = `${prefix}-${day}`
    const stats = summarize(bookings.filter((booking) => booking.date === iso))
    return { key: iso, label: String(index + 1), ...stats }
  })
}

function yoyChange(current: number, previous: number) {
  if (previous <= 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 100)
}

function formatCount(value: number) {
  return value.toLocaleString('en-GB')
}

function truncate(value: string | null | undefined, max: number) {
  const text = (value ?? '').trim()
  if (text.length <= max) return text || '—'
  return `${text.slice(0, max - 1)}…`
}

function inMonth(isoDate: string, month: Date) {
  const year = month.getFullYear()
  const monthPart = String(month.getMonth() + 1).padStart(2, '0')
  return isoDate.startsWith(`${year}-${monthPart}`)
}

function inYear(isoDate: string, year: number) {
  return isoDate.startsWith(`${year}-`)
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
  return bookings.reduce(
    (sum, booking) => (isActiveBooking(booking) ? sum + totalPassengers(booking) : sum),
    0,
  )
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
