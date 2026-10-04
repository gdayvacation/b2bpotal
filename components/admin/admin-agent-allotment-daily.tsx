'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight, Save } from 'lucide-react'
import { useInvoiceStore } from '@/components/admin/use-invoice-store'
import { usePortal } from '@/components/portal-provider'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getArrivedPaxSnapshot } from '@/lib/check-in-arrived-pax'
import { addDaysISO, formatShortDate, todayISO } from '@/lib/format'
import { listAgentAllotments, type AgentAllotment } from '@/lib/supabase/agent-allotment-db'
import {
  listAgentAllotmentDaily,
  upsertAgentAllotmentDaily,
  type AgentAllotmentDaily,
} from '@/lib/supabase/agent-allotment-daily-db'
import { chargeablePax, isActiveBooking, type Booking, type Program } from '@/lib/types'
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

function monthRangeContaining(isoDate: string) {
  const [year, month] = isoDate.split('-').map(Number)
  const from = `${year}-${String(month).padStart(2, '0')}-01`
  const last = new Date(year, month, 0).getDate()
  const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`
  return { from, to }
}

function shiftMonthRange(from: string, delta: number) {
  const [year, month] = from.split('-').map(Number)
  const next = new Date(year, month - 1 + delta, 1)
  const iso = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`
  return monthRangeContaining(iso)
}

function formatMonthLabel(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

function headsFromPax(pax: { adults: number; children: number }) {
  return chargeablePax(pax)
}

function lotSaveLabel(lot: AgentAllotment) {
  return `${formatShortDate(lot.paidDate || lot.createdAt.slice(0, 10))} · ${lot.adultPrice}`
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

export function AdminAgentAllotmentDailyChecker({
  onBack,
  program,
}: {
  onBack: () => void
  program: Program
}) {
  const { bookings, getCheckInAttendance, agents } = usePortal()
  const invoiceStore = useInvoiceStore()
  const [fromDate, setFromDate] = useState(() => monthRangeContaining(todayISO()).from)
  const [toDate, setToDate] = useState(() => monthRangeContaining(todayISO()).to)
  const [filterAgent, setFilterAgent] = useState('')
  const [purchasedByAgent, setPurchasedByAgent] = useState<Record<string, number>>({})
  const [allotments, setAllotments] = useState<AgentAllotment[]>([])
  const [allDaily, setAllDaily] = useState<AgentAllotmentDaily[]>([])
  const [draftDeduct, setDraftDeduct] = useState<Record<string, string>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [loading, setLoading] = useState(true)

  const selectedDays = useMemo(() => eachIsoDay(fromDate, toDate), [fromDate, toDate])
  const monthLabel = formatMonthLabel(fromDate)

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
    const programLots = allotments.filter((row) => row.program === program)
    const purchased: Record<string, number> = {}
    for (const row of programLots) {
      purchased[row.agentSlug] = (purchased[row.agentSlug] ?? 0) + row.seats
    }
    setPurchasedByAgent(purchased)
    setAllotments(programLots)
    setAllDaily(everyDaily.filter((row) => row.program === program))
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
  }, [program])

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
          booking.program === program &&
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
        if (
          !saved &&
          stats.bookingHead === 0 &&
          stats.checkInHead === 0 &&
          stats.noShowHead === 0 &&
          stats.invoiceHead === 0
        ) {
          continue
        }
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
    program,
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

  function shiftMonth(delta: number) {
    const next = shiftMonthRange(fromDate, delta)
    setFromDate(next.from)
    setToDate(next.to)
  }

  async function saveRow(row: CheckerRow) {
    setSaveError('')
    const key = draftKey(row.day, row.agentSlug)
    const raw = draftDeduct[key] ?? String(row.totalDeduct)
    const totalDeduct = Math.max(0, Math.floor(Number(raw) || 0))
    const receiving = allotments.find(
      (lot) => lot.agentSlug === row.agentSlug && lot.receivesBookings,
    )
    setSavingKey(key)
    try {
      await upsertAgentAllotmentDaily({
        day: row.day,
        agentSlug: row.agentSlug,
        agentName: row.agentName,
        program,
        totalDeduct,
        allotmentId: receiving?.id ?? null,
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
        description="One row is one agent on one date. Save loads that day onto the open allotment. A saved row shows Saved and keeps its lot."
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
            <Label className="text-xs text-neutral-400">Month</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Previous month"
                onClick={() => shiftMonth(-1)}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <div
                id="daily-checker-date"
                className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm text-teal-950"
              >
                <CalendarDays className="size-3.5 shrink-0 text-teal-700/60" />
                <span className="truncate">{monthLabel}</span>
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label="Next month"
                onClick={() => shiftMonth(1)}
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
              {monthLabel} · one row per date and agent. Save each row on its own.
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
            : `No booking days to save in ${monthLabel}${filterAgent ? ' for this agent' : ''}.`}
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
                      <p className="text-[11px] text-teal-900/45">
                        {(() => {
                          const savedLotId = savedByDayAgent.get(draftKey(row.day, row.agentSlug))?.allotmentId
                          const pinned = savedLotId
                            ? allotments.find((lot) => lot.id === savedLotId)
                            : null
                          const open = allotments.find(
                            (lot) => lot.agentSlug === row.agentSlug && lot.receivesBookings,
                          )
                          if (pinned) return `On lot ${lotSaveLabel(pinned)}`
                          if (open) return `Save loads into ${lotSaveLabel(open)}`
                          return 'Open an allotment before this day can load'
                        })()}
                      </p>
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
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase',
                        row.saved ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900',
                      )}
                    >
                      {row.saved ? 'Saved' : 'Suggested'}
                    </span>
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
                      {savingKey === key ? 'Saving…' : row.saved && draftNum === row.totalDeduct ? 'Saved' : 'Save'}
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
                  <TableHead className="px-4 text-teal-700/45">Date</TableHead>
                  <TableHead className="text-teal-700/45">Agent</TableHead>
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
                      <TableCell className="px-4 whitespace-nowrap">
                        {formatShortDate(row.day)}
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>
                          {row.agentName}
                          <span
                            className={cn(
                              'ml-2 text-[10px] font-semibold tracking-wide uppercase',
                              row.saved ? 'text-emerald-700' : 'text-amber-700',
                            )}
                          >
                            {row.saved ? 'Saved' : 'Suggested'}
                          </span>
                          <p className="text-[11px] font-normal text-teal-900/45">
                            {(() => {
                              const pinned = savedByDayAgent.get(key)?.allotmentId
                                ? allotments.find((lot) => lot.id === savedByDayAgent.get(key)?.allotmentId)
                                : null
                              const open = allotments.find(
                                (lot) => lot.agentSlug === row.agentSlug && lot.receivesBookings,
                              )
                              if (pinned) return `On lot ${lotSaveLabel(pinned)}`
                              if (open) return `Save loads into ${lotSaveLabel(open)}`
                              return 'Open an allotment before this day can load'
                            })()}
                          </p>
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
                          {savingKey === key ? 'Saving…' : row.saved && !dirty ? 'Saved' : 'Save'}
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
