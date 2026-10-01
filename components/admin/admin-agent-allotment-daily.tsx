'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, CalendarIcon, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { useInvoiceStore } from '@/components/admin/use-invoice-store'
import { usePortal } from '@/components/portal-provider'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getArrivedPaxSnapshot } from '@/lib/check-in-arrived-pax'
import { addDaysISO, dateFromISO, formatShortDate, todayISO, toISODate } from '@/lib/format'
import { listAgentAllotments } from '@/lib/supabase/agent-allotment-db'
import {
  listAgentAllotmentDaily,
  upsertAgentAllotmentDaily,
  type AgentAllotmentDaily,
} from '@/lib/supabase/agent-allotment-daily-db'
import { chargeablePax, isActiveBooking, type Booking } from '@/lib/types'
import { cn } from '@/lib/utils'

type CheckerRow = {
  day: string
  agentSlug: string
  agentName: string
  bookingHead: number
  checkInHead: number
  noShowHead: number
  invoiceHead: number
  suggestedDeduct: number
  totalDeduct: number
  saved: boolean
  purchased: number
  deductedToDate: number
}

function draftKey(day: string, agentSlug: string) {
  return `${day}|${agentSlug}`
}

function eachIsoDay(from: string, to: string) {
  const start = from <= to ? from : to
  const end = from <= to ? to : from
  const days: string[] = []
  let cursor = start
  while (cursor <= end) {
    days.push(cursor)
    cursor = addDaysISO(cursor, 1)
    if (days.length > 62) break
  }
  return days
}

function headsFromPax(pax: { adults: number; children: number }) {
  return chargeablePax(pax)
}

function bookingHeads(booking: Booking) {
  return headsFromPax(booking)
}

function checkInHeadsForBooking(
  booking: Booking,
  attendance: 'checked' | 'no-show' | null,
): { checkIn: number; noShow: number } {
  if (attendance === 'no-show') {
    return { checkIn: 0, noShow: bookingHeads(booking) }
  }
  if (attendance === 'checked') {
    const arrived = getArrivedPaxSnapshot(booking.date, booking.program, booking.code)
    return {
      checkIn: arrived ? headsFromPax(arrived) : bookingHeads(booking),
      noShow: 0,
    }
  }
  return { checkIn: 0, noShow: 0 }
}

export function AdminAgentAllotmentDailyChecker({ onBack }: { onBack: () => void }) {
  const { bookings, getCheckInAttendance, agents } = usePortal()
  const invoiceStore = useInvoiceStore()
  const [fromDate, setFromDate] = useState(() => todayISO())
  const [toDate, setToDate] = useState(() => todayISO())
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [filterAgent, setFilterAgent] = useState('')
  const [purchasedByAgent, setPurchasedByAgent] = useState<Record<string, number>>({})
  const [allDaily, setAllDaily] = useState<AgentAllotmentDaily[]>([])
  const [draftDeduct, setDraftDeduct] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)

  const selectedDays = useMemo(() => eachIsoDay(fromDate, toDate), [fromDate, toDate])
  const multiDay = fromDate !== toDate
  const dateLabel =
    fromDate === toDate
      ? formatShortDate(fromDate)
      : `${formatShortDate(fromDate)} – ${formatShortDate(toDate)}`

  const invoicedCodes = useMemo(() => {
    const codes = new Set<string>()
    for (const doc of invoiceStore.invoices) {
      if (doc.kind !== 'invoice') continue
      for (const item of doc.items) {
        if (item.bookingCode) codes.add(item.bookingCode)
      }
    }
    return codes
  }, [invoiceStore.invoices])

  async function refresh() {
    const [allotments, everyDaily] = await Promise.all([
      listAgentAllotments(),
      listAgentAllotmentDaily(),
    ])
    const purchased: Record<string, number> = {}
    for (const row of allotments) {
      purchased[row.agentSlug] = (purchased[row.agentSlug] ?? 0) + row.seats
    }
    setPurchasedByAgent(purchased)
    setAllDaily(everyDaily)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        await refresh()
      } catch (caught) {
        if (!cancelled) {
          setLoadError(
            caught instanceof Error ? caught.message : 'Could not load daily allotment checker.',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const deductedByAgent = useMemo(() => {
    const map: Record<string, number> = {}
    for (const row of allDaily) {
      map[row.agentSlug] = (map[row.agentSlug] ?? 0) + row.totalDeduct
    }
    return map
  }, [allDaily])

  const savedByDayAgent = useMemo(() => {
    const map = new Map<string, AgentAllotmentDaily>()
    for (const row of allDaily) {
      map.set(draftKey(row.day, row.agentSlug), row)
    }
    return map
  }, [allDaily])

  const prebuyAgentSlugs = useMemo(
    () =>
      new Set(
        Object.entries(purchasedByAgent)
          .filter(([, seats]) => seats > 0)
          .map(([slug]) => slug),
      ),
    [purchasedByAgent],
  )

  const rows = useMemo<CheckerRow[]>(() => {
    const result: CheckerRow[] = []

    for (const day of selectedDays) {
      const dayBookings = bookings.filter(
        (booking) =>
          booking.date === day &&
          isActiveBooking(booking) &&
          prebuyAgentSlugs.has(booking.agentSlug),
      )
      const byAgent = new Map<
        string,
        {
          agentName: string
          bookingHead: number
          checkInHead: number
          noShowHead: number
          invoiceHead: number
        }
      >()

      for (const booking of dayBookings) {
        const current = byAgent.get(booking.agentSlug) ?? {
          agentName: booking.agentName,
          bookingHead: 0,
          checkInHead: 0,
          noShowHead: 0,
          invoiceHead: 0,
        }
        const heads = bookingHeads(booking)
        current.bookingHead += heads
        const attendance = getCheckInAttendance(booking.date, booking.program, booking.code)
        const mix = checkInHeadsForBooking(booking, attendance)
        current.checkInHead += mix.checkIn
        current.noShowHead += mix.noShow
        if (invoicedCodes.has(booking.code)) current.invoiceHead += heads
        byAgent.set(booking.agentSlug, current)
      }

      // Always list every prebuy agent for the day (even with 0 bookings).
      for (const slug of prebuyAgentSlugs) {
        if (byAgent.has(slug)) continue
        const saved = savedByDayAgent.get(draftKey(day, slug))
        const name =
          agents.find((agent) => agent.slug === slug)?.name || saved?.agentName || slug
        byAgent.set(slug, {
          agentName: name,
          bookingHead: 0,
          checkInHead: 0,
          noShowHead: 0,
          invoiceHead: 0,
        })
      }

      for (const [agentSlug, stats] of byAgent) {
        if (filterAgent && agentSlug !== filterAgent) continue
        if (!prebuyAgentSlugs.has(agentSlug)) continue
        const saved = savedByDayAgent.get(draftKey(day, agentSlug))
        const suggested = stats.checkInHead + stats.noShowHead
        result.push({
          day,
          agentSlug,
          agentName: stats.agentName,
          bookingHead: stats.bookingHead,
          checkInHead: stats.checkInHead,
          noShowHead: stats.noShowHead,
          invoiceHead: stats.invoiceHead,
          suggestedDeduct: suggested > 0 ? suggested : stats.bookingHead,
          totalDeduct: saved?.totalDeduct ?? (suggested > 0 ? suggested : stats.bookingHead),
          saved: Boolean(saved),
          purchased: purchasedByAgent[agentSlug] ?? 0,
          deductedToDate: deductedByAgent[agentSlug] ?? 0,
        })
      }
    }

    return result.sort(
      (a, b) =>
        a.day.localeCompare(b.day) ||
        a.agentName.localeCompare(b.agentName),
    )
  }, [
    agents,
    bookings,
    deductedByAgent,
    filterAgent,
    getCheckInAttendance,
    invoicedCodes,
    prebuyAgentSlugs,
    purchasedByAgent,
    savedByDayAgent,
    selectedDays,
  ])

  useEffect(() => {
    setDraftDeduct((current) => {
      const next: Record<string, string> = {}
      for (const row of rows) {
        const key = draftKey(row.day, row.agentSlug)
        next[key] = current[key] ?? String(row.totalDeduct)
      }
      return next
    })
  }, [rows])

  const agentOptions = useMemo(() => {
    return [...prebuyAgentSlugs]
      .map((slug) => ({
        slug,
        name:
          agents.find((agent) => agent.slug === slug)?.name ||
          rows.find((row) => row.agentSlug === slug)?.agentName ||
          slug,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [agents, prebuyAgentSlugs, rows])

  const dayTotals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        const key = draftKey(row.day, row.agentSlug)
        const draft = Math.max(0, Math.floor(Number(draftDeduct[key]) || 0))
        acc.booking += row.bookingHead
        acc.checkIn += row.checkInHead
        acc.noShow += row.noShowHead
        acc.invoice += row.invoiceHead
        acc.deduct += draft
        return acc
      },
      { booking: 0, checkIn: 0, noShow: 0, invoice: 0, deduct: 0 },
    )
  }, [draftDeduct, rows])

  function selectDateRange(range: { from?: Date; to?: Date } | undefined) {
    if (!range?.from) return
    const from = toISODate(range.from)
    const to = range.to ? toISODate(range.to) : from
    setFromDate(from <= to ? from : to)
    setToDate(from <= to ? to : from)
    if (range.to || from === to) setCalendarOpen(false)
  }

  function shiftRange(delta: number) {
    setFromDate((current) => addDaysISO(current, delta))
    setToDate((current) => addDaysISO(current, delta))
  }

  async function saveRow(row: CheckerRow) {
    setSaveError('')
    const key = draftKey(row.day, row.agentSlug)
    const raw = draftDeduct[key] ?? String(row.totalDeduct)
    const totalDeduct = Math.max(0, Math.floor(Number(raw) || 0))
    setSavingKey(key)
    try {
      await upsertAgentAllotmentDaily({
        day: row.day,
        agentSlug: row.agentSlug,
        agentName: row.agentName,
        totalDeduct,
      })
      await refresh()
    } catch (caught) {
      setSaveError(caught instanceof Error ? caught.message : 'Could not save total deduct.')
    } finally {
      setSavingKey(null)
    }
  }

  return (
    <div className="w-full">
      <PageHeader
        title="Daily checker"
        description="Shows only agents with prebuy allotment. Pick one day or a range — edit Total Deduct when needed."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
        }
      />

      <Surface className="mb-4 p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
            <Label className="text-xs text-neutral-400">Tour date</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Previous day"
                onClick={() => shiftRange(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      id="daily-checker-date"
                      className={cn(
                        'h-10 min-w-0 flex-1 justify-start gap-1.5 rounded-xl px-3 text-sm font-normal',
                        multiDay && 'border-teal-700/35 bg-teal-50/80',
                      )}
                    />
                  }
                >
                  <CalendarIcon className="size-3.5 shrink-0 text-teal-700/60" />
                  <span className="truncate">{dateLabel}</span>
                  {multiDay ? (
                    <span className="rounded-md bg-teal-800/10 px-1.5 py-0.5 text-[10px] font-semibold text-teal-900">
                      {selectedDays.length}d
                    </span>
                  ) : null}
                </PopoverTrigger>
                <PopoverContent align="start" className="!w-fit max-w-none overflow-visible p-3">
                  <Calendar
                    mode="range"
                    selected={{ from: dateFromISO(fromDate), to: dateFromISO(toDate) }}
                    onSelect={selectDateRange}
                    defaultMonth={dateFromISO(fromDate)}
                    numberOfMonths={1}
                    className="w-full [--cell-size:2.35rem]"
                  />
                  <p className="px-2 pb-1 text-xs text-teal-900/45">
                    One day, or click a second day for a range.
                  </p>
                </PopoverContent>
              </Popover>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Next day"
                onClick={() => shiftRange(1)}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="daily-checker-agent" className="text-xs text-neutral-400">
              Agent name
            </Label>
            <select
              id="daily-checker-agent"
              value={filterAgent}
              onChange={(event) => setFilterAgent(event.target.value)}
              className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
            >
              <option value="">All prebuy agents</option>
              {agentOptions.map((agent) => (
                <option key={agent.slug} value={agent.slug}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end sm:col-span-2 lg:col-span-2">
            <p className="text-sm text-teal-900/55">
              <CalendarDays className="mr-1.5 inline size-3.5 align-text-bottom" />
              {dateLabel} · AD+CH heads from Booking, Check-in, No show, and Invoice
            </p>
          </div>
        </div>
      </Surface>

      {loadError ? (
        <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {loadError} Run <span className="font-mono">supabase/add-agent-allotment-daily.sql</span> if
          this table is new.
        </p>
      ) : null}
      {saveError ? (
        <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {saveError}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-teal-900/50">Loading daily checker…</p> : null}

      {!loading && rows.length === 0 && !loadError ? (
        <Surface className="p-6 text-sm text-teal-900/55">
          {prebuyAgentSlugs.size === 0
            ? 'No prebuy agents yet. Add an allotment purchase first, then return here to deduct heads.'
            : `No prebuy agents to show for ${dateLabel}${filterAgent ? ' with this agent filter' : ''}. Clear the agent filter or pick another date.`}
        </Surface>
      ) : null}

      {rows.length > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap gap-3 text-sm text-teal-900/60">
            <span>
              Booking <span className="font-semibold text-teal-950">{dayTotals.booking}</span>
            </span>
            <span>·</span>
            <span>
              Check-in <span className="font-semibold text-teal-950">{dayTotals.checkIn}</span>
            </span>
            <span>·</span>
            <span>
              No Show <span className="font-semibold text-teal-950">{dayTotals.noShow}</span>
            </span>
            <span>·</span>
            <span>
              Invoice <span className="font-semibold text-teal-950">{dayTotals.invoice}</span>
            </span>
            <span>·</span>
            <span>
              Total Deduct <span className="font-semibold text-teal-950">{dayTotals.deduct}</span>
            </span>
          </div>

          <div className="space-y-3 md:hidden">
            {rows.map((row) => {
              const key = draftKey(row.day, row.agentSlug)
              const draft = draftDeduct[key] ?? String(row.totalDeduct)
              const draftNum = Math.max(0, Math.floor(Number(draft) || 0))
              const hasAllotment = row.purchased > 0
              const usedAfter =
                row.deductedToDate - (row.saved ? row.totalDeduct : 0) + draftNum
              const remaining = hasAllotment ? row.purchased - usedAfter : null
              return (
                <Surface key={key} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-teal-900/45">{formatShortDate(row.day)}</p>
                      <p className="font-semibold text-teal-950">{row.agentName}</p>
                      <p className="mt-1 text-xs text-teal-900/50">
                        {hasAllotment ? (
                          <>
                            Purchased {row.purchased} · Deducted {usedAfter} · Left{' '}
                            <span
                              className={cn(
                                remaining !== null && remaining < 0
                                  ? 'text-rose-600'
                                  : 'text-teal-900',
                              )}
                            >
                              {remaining}
                            </span>
                          </>
                        ) : (
                          <span className="text-teal-900/40">No lots yet.</span>
                        )}
                      </p>
                    </div>
                    {!row.saved ? (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                        Suggested
                      </span>
                    ) : null}
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-xs text-teal-900/45">Booking Head</dt>
                      <dd className="font-semibold tabular-nums text-teal-950">{row.bookingHead}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-teal-900/45">Check in</dt>
                      <dd className="font-semibold tabular-nums text-teal-950">{row.checkInHead}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-teal-900/45">No Show</dt>
                      <dd className="font-semibold tabular-nums text-teal-950">{row.noShowHead}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-teal-900/45">Invoice</dt>
                      <dd className="font-semibold tabular-nums text-teal-950">{row.invoiceHead}</dd>
                    </div>
                  </dl>
                  <div className="mt-3 flex items-end gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <Label className="text-xs text-neutral-400">Total Deduct</Label>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="h-10"
                        value={draftDeduct[key] ?? ''}
                        onChange={(event) =>
                          setDraftDeduct((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </div>
                    <Button
                      type="button"
                      className="h-10"
                      disabled={savingKey === key}
                      onClick={() => void saveRow(row)}
                    >
                      <Save data-icon="inline-start" />
                      {savingKey === key ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </Surface>
              )
            })}
          </div>

          <Surface className="hidden overflow-x-auto md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  {multiDay ? <TableHead className="px-4 text-teal-700/45">Date</TableHead> : null}
                  <TableHead className={cn('text-teal-700/45', !multiDay && 'px-4')}>Agent</TableHead>
                  <TableHead className="text-right text-teal-700/45">Booking Head</TableHead>
                  <TableHead className="text-right text-teal-700/45">Check in</TableHead>
                  <TableHead className="text-right text-teal-700/45">No Show</TableHead>
                  <TableHead className="text-right text-teal-700/45">Invoice</TableHead>
                  <TableHead className="text-right text-teal-700/45">Total Deduct</TableHead>
                  <TableHead className="text-right text-teal-700/45">Left</TableHead>
                  <TableHead className="text-right text-teal-700/45" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const key = draftKey(row.day, row.agentSlug)
                  const draft = draftDeduct[key] ?? String(row.totalDeduct)
                  const draftNum = Math.max(0, Math.floor(Number(draft) || 0))
                  const hasAllotment = row.purchased > 0
                  const usedAfter =
                    row.deductedToDate - (row.saved ? row.totalDeduct : 0) + draftNum
                  const remaining = hasAllotment ? row.purchased - usedAfter : null
                  const dirty = draftNum !== row.totalDeduct || !row.saved
                  return (
                    <TableRow key={key}>
                      {multiDay ? (
                        <TableCell className="px-4 whitespace-nowrap">
                          {formatShortDate(row.day)}
                        </TableCell>
                      ) : null}
                      <TableCell className={cn('font-medium', !multiDay && 'px-4')}>
                        <div>
                          {row.agentName}
                          {!row.saved ? (
                            <span className="ml-2 text-[10px] font-semibold tracking-wide text-amber-700 uppercase">
                              suggested
                            </span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.bookingHead}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.checkInHead}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.noShowHead}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.invoiceHead}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          min={0}
                          step={1}
                          className="ml-auto h-9 w-24 text-right"
                          value={draft}
                          onChange={(event) =>
                            setDraftDeduct((current) => ({
                              ...current,
                              [key]: event.target.value,
                            }))
                          }
                        />
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right tabular-nums',
                          remaining === null
                            ? 'font-normal text-teal-900/35'
                            : remaining < 0
                              ? 'font-semibold text-rose-600'
                              : 'text-teal-900/70',
                        )}
                        title={
                          remaining === null
                            ? 'Add an allotment purchase for this agent to track seats left'
                            : undefined
                        }
                      >
                        {remaining === null ? '—' : remaining}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          type="button"
                          size="sm"
                          variant={dirty ? 'default' : 'outline'}
                          disabled={savingKey === key}
                          onClick={() => void saveRow(row)}
                        >
                          <Save data-icon="inline-start" />
                          {savingKey === key ? 'Saving…' : 'Save'}
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Surface>
        </>
      ) : null}
    </div>
  )
}
