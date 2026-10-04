'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Printer, X } from 'lucide-react'
import { usePortal } from '@/components/portal-provider'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
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
import { BRAND_LEGAL, BRAND_SHORT } from '@/lib/brand'
import { formatMonthLabel, formatShortDate, todayISO } from '@/lib/format'
import { listAgentAllotments, type AgentAllotment } from '@/lib/supabase/agent-allotment-db'
import {
  listAgentAllotmentDaily,
  type AgentAllotmentDaily,
} from '@/lib/supabase/agent-allotment-daily-db'
import {
  chargeablePax,
  formatPaxBreakdown,
  isActiveBooking,
  type Booking,
  type Program,
} from '@/lib/types'
import { cn } from '@/lib/utils'

type FilterKind = 'date' | 'month' | 'agent' | 'program' | 'checker' | 'guest' | 'vc'
type CheckerFilter = '' | 'confirmed' | 'pending'

const EXTRA_FILTER_OPTIONS: { kind: FilterKind; label: string; hint: string }[] = [
  { kind: 'program', label: 'Program', hint: 'PP or James Bond' },
  { kind: 'checker', label: 'Checker', hint: 'Confirmed or still pending' },
  { kind: 'guest', label: 'Guest', hint: 'Lead guest name' },
  { kind: 'vc', label: 'VC No', hint: 'Agent voucher number' },
]

type HistoryLine = {
  key: string
  date: string
  vcNo: string
  agentSlug: string
  agentName: string
  guestName: string
  bookingLabel: string
  paxLabel: string
  program: Program | null
  adults: number
  children: number
  adultPrice: number
  childPrice: number
  /** Ticket amount = AD heads × allotment AD price. */
  amountAd: number | null
  /** Ticket amount = CH heads × allotment CH price. */
  amountCh: number | null
  /** AD+CH heads for this booking (or day total when no booking rows). */
  totalHeadUse: number | null
  /** Running seats left after this day — shown on the last line of the day. */
  balance: number | null
  isDayEnd: boolean
  /** True when Total head use was confirmed in Daily checker (day may differ from booking sum). */
  checkerConfirmed: boolean
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

/** Adult + CH ticket amounts; null when neither side has a priced amount. */
function lineTicketTotal(line: Pick<HistoryLine, 'amountAd' | 'amountCh'>): number | null {
  if (line.amountAd === null && line.amountCh === null) return null
  return (line.amountAd ?? 0) + (line.amountCh ?? 0)
}

function currentMonthValue(now = new Date()) {
  const [y, m] = todayISO(now).split('-')
  return `${y}-${m}`
}

function programLabel(program: Booking['program']) {
  return program === 'PP' ? 'PP' : 'JB'
}

export function AdminAgentAllotmentHistory({
  onBack,
  onAdd,
  program,
}: {
  onBack: () => void
  onAdd: () => void
  program: Program
}) {
  const { bookings, agents } = usePortal()
  const [purchases, setPurchases] = useState<AgentAllotment[]>([])
  const [daily, setDaily] = useState<AgentAllotmentDaily[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filterDate, setFilterDate] = useState('')
  const [filterMonth, setFilterMonth] = useState(() => currentMonthValue())
  const [filterAgent, setFilterAgent] = useState('')
  const [filterProgram, setFilterProgram] = useState<Program | ''>(program)
  const [filterChecker, setFilterChecker] = useState<CheckerFilter>('')
  const [filterGuest, setFilterGuest] = useState('')
  const [filterVc, setFilterVc] = useState('')
  const [extraFilters, setExtraFilters] = useState<FilterKind[]>([])
  const [addFilterOpen, setAddFilterOpen] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        const [nextPurchases, nextDaily] = await Promise.all([
          listAgentAllotments(),
          listAgentAllotmentDaily(),
        ])
        if (!cancelled) {
          setPurchases(nextPurchases)
          setDaily(nextDaily)
        }
      } catch (caught) {
        if (!cancelled) {
          setLoadError(
            caught instanceof Error ? caught.message : 'Could not load allotment history.',
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

  const purchasedByAgent = useMemo(() => {
    const map = new Map<
      string,
      { name: string; seats: number; totalAmount: number }
    >()
    for (const row of purchases) {
      if (row.program !== program) continue
      const current = map.get(row.agentSlug) ?? {
        name: row.agentName,
        seats: 0,
        totalAmount: 0,
      }
      current.seats += row.seats
      current.totalAmount += Math.max(0, Number(row.totalAmount) || 0)
      current.name = row.agentName
      map.set(row.agentSlug, current)
    }
    return map
  }, [purchases, program])

  /** Latest allotment AD/CH price per agent (prefer a purchase that has prices set). */
  const ratesByAgent = useMemo(() => {
    const bySlug = new Map<string, { adultPrice: number; childPrice: number }>()
    const byName = new Map<string, { adultPrice: number; childPrice: number }>()
    const sorted = [...purchases].sort((a, b) => {
      const aKey = a.paidDate || a.createdAt
      const bKey = b.paidDate || b.createdAt
      return aKey.localeCompare(bKey)
    })
    for (const row of sorted) {
      if (row.program !== program) continue
      const adultPrice = Math.max(0, Number(row.adultPrice) || 0)
      const childPrice = Math.max(0, Number(row.childPrice) || 0)
      const next = { adultPrice, childPrice }
      const merge = (
        map: Map<string, { adultPrice: number; childPrice: number }>,
        key: string,
      ) => {
        const existing = map.get(key)
        if (!existing) {
          map.set(key, next)
          return
        }
        map.set(key, {
          adultPrice: adultPrice > 0 ? adultPrice : existing.adultPrice,
          childPrice: childPrice > 0 ? childPrice : existing.childPrice,
        })
      }
      merge(bySlug, row.agentSlug)
      merge(byName, row.agentName.trim().toLowerCase())
    }
    return { bySlug, byName }
  }, [purchases, program])

  function ratesForAgent(agentSlug: string, agentName: string) {
    return (
      ratesByAgent.bySlug.get(agentSlug) ??
      ratesByAgent.byName.get(agentName.trim().toLowerCase()) ?? {
        adultPrice: 0,
        childPrice: 0,
      }
    )
  }

  const selectedAgentMeta = filterAgent
    ? {
        slug: filterAgent,
        name:
          purchasedByAgent.get(filterAgent)?.name ||
          agents.find((agent) => agent.slug === filterAgent)?.name ||
          filterAgent,
      }
    : null
  const selectedAgentRates = selectedAgentMeta
    ? ratesForAgent(selectedAgentMeta.slug, selectedAgentMeta.name)
    : undefined
  const adultHeader =
    selectedAgentRates && selectedAgentRates.adultPrice > 0
      ? `Adult ${formatMoney(selectedAgentRates.adultPrice)}`
      : 'Adult'
  const childHeader =
    selectedAgentRates && selectedAgentRates.childPrice > 0
      ? `CH ${formatMoney(selectedAgentRates.childPrice)}`
      : 'CH'

  const dailyByAgentDay = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of daily) {
      if (row.program !== program) continue
      map.set(`${row.agentSlug}|${row.day}`, row.totalDeduct)
    }
    return map
  }, [daily, program])

  const agentOptions = useMemo(() => {
    const map = new Map<string, string>()
    for (const [slug, info] of purchasedByAgent) map.set(slug, info.name)
    for (const row of daily) map.set(row.agentSlug, row.agentName)
    for (const agent of agents) {
      if (!map.has(agent.slug) && purchasedByAgent.has(agent.slug)) {
        map.set(agent.slug, agent.name)
      }
    }
    for (const booking of bookings) {
      if (purchasedByAgent.has(booking.agentSlug) || daily.some((d) => d.agentSlug === booking.agentSlug)) {
        map.set(booking.agentSlug, booking.agentName)
      }
    }
    return [...map.entries()]
      .map(([slug, name]) => ({ slug, name }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [agents, bookings, daily, purchasedByAgent])

  const lines = useMemo<HistoryLine[]>(() => {
    const agentSlugs = filterAgent
      ? [filterAgent]
      : [...new Set([...purchasedByAgent.keys(), ...daily.map((row) => row.agentSlug)])]

    const result: HistoryLine[] = []

    for (const agentSlug of agentSlugs) {
      const purchased = purchasedByAgent.get(agentSlug)?.seats ?? 0
      const agentName =
        purchasedByAgent.get(agentSlug)?.name ||
        daily.find((row) => row.agentSlug === agentSlug)?.agentName ||
        agents.find((agent) => agent.slug === agentSlug)?.name ||
        agentSlug

      const allAgentBookings = bookings
        .filter((booking) => booking.agentSlug === agentSlug && isActiveBooking(booking))
        .sort(
          (a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code),
        )

      const agentBookings = allAgentBookings.filter(
        (booking) =>
          (!filterDate || booking.date === filterDate) &&
          (!filterMonth || booking.date.startsWith(filterMonth)) &&
          (!filterProgram || booking.program === filterProgram),
      )

      const checkerDays = daily
        .filter((row) => {
          if (row.agentSlug !== agentSlug) return false
          if (row.program !== program) return false
          if (filterDate && row.day !== filterDate) return false
          if (filterMonth && !row.day.startsWith(filterMonth)) return false
          return true
        })
        .map((row) => row.day)

      const days = [...new Set([...agentBookings.map((b) => b.date), ...checkerDays])].sort()

      const bookingHeadsByDay = new Map<string, number>()
      for (const booking of allAgentBookings) {
        if (filterProgram && booking.program !== filterProgram) continue
        bookingHeadsByDay.set(
          booking.date,
          (bookingHeadsByDay.get(booking.date) ?? 0) + chargeablePax(booking),
        )
      }

      /** Confirmed Daily checker when saved; otherwise booking AD+CH for that day. */
      function dayDeduct(day: string) {
        const saved = dailyByAgentDay.get(`${agentSlug}|${day}`)
        if (saved !== undefined) return saved
        return bookingHeadsByDay.get(day) ?? 0
      }

      const allDaysForBalance = [
        ...new Set([
          ...allAgentBookings.map((b) => b.date),
          ...daily.filter((row) => row.agentSlug === agentSlug).map((row) => row.day),
        ]),
      ].sort()

      for (const day of days) {
        const dayBookings = agentBookings.filter((booking) => booking.date === day)
        const hasChecker = dailyByAgentDay.has(`${agentSlug}|${day}`)
        const deductedBefore = allDaysForBalance
          .filter((iso) => iso < day)
          .reduce((sum, iso) => sum + dayDeduct(iso), 0)
        const balanceAfter = purchased - deductedBefore - dayDeduct(day)
        const rates = ratesForAgent(agentSlug, agentName)

        if (dayBookings.length === 0) {
          result.push({
            key: `${agentSlug}|${day}|checker`,
            date: day,
            vcNo: '—',
            agentSlug,
            agentName,
            guestName: '—',
            bookingLabel: hasChecker ? 'Daily checker' : 'No bookings',
            paxLabel: '—',
            program: filterProgram || null,
            adults: 0,
            children: 0,
            adultPrice: rates.adultPrice,
            childPrice: rates.childPrice,
            amountAd: null,
            amountCh: null,
            totalHeadUse: dayDeduct(day),
            balance: balanceAfter,
            isDayEnd: true,
            checkerConfirmed: hasChecker,
          })
          continue
        }

        dayBookings.forEach((booking, index) => {
          const isLast = index === dayBookings.length - 1
          const adults = Math.max(0, booking.adults)
          const children = Math.max(0, booking.children)
          result.push({
            key: `${booking.code}|${day}`,
            date: day,
            vcNo: booking.agentRef.trim() || '—',
            agentSlug,
            agentName,
            guestName: booking.leadGuest,
            bookingLabel: `${programLabel(booking.program)} · ${booking.status}`,
            paxLabel: formatPaxBreakdown(booking),
            program: booking.program,
            adults,
            children,
            adultPrice: rates.adultPrice,
            childPrice: rates.childPrice,
            amountAd: rates.adultPrice > 0 ? adults * rates.adultPrice : null,
            amountCh: rates.childPrice > 0 ? children * rates.childPrice : null,
            totalHeadUse: chargeablePax(booking),
            balance: isLast ? balanceAfter : null,
            isDayEnd: isLast,
            checkerConfirmed: hasChecker,
          })
        })
      }
    }

    const sorted = result.sort(
      (a, b) =>
        b.date.localeCompare(a.date) ||
        a.agentName.localeCompare(b.agentName) ||
        a.vcNo.localeCompare(b.vcNo),
    )

    const guestQ = filterGuest.trim().toLowerCase()
    const vcQ = filterVc.trim().toLowerCase()

    return sorted.filter((line) => {
      if (filterChecker === 'confirmed' && !line.checkerConfirmed) return false
      if (filterChecker === 'pending' && line.checkerConfirmed) return false
      if (filterProgram && line.program && line.program !== filterProgram) return false
      if (filterProgram && !line.program) return false
      if (guestQ && !line.guestName.toLowerCase().includes(guestQ)) return false
      if (vcQ && !line.vcNo.toLowerCase().includes(vcQ)) return false
      return true
    })
  }, [
    agents,
    bookings,
    daily,
    dailyByAgentDay,
    filterAgent,
    filterChecker,
    filterDate,
    filterGuest,
    filterMonth,
    filterProgram,
    filterVc,
    purchasedByAgent,
    ratesByAgent,
  ])

  const balanceSummary = useMemo(() => {
    const slugs = filterAgent ? [filterAgent] : [...purchasedByAgent.keys()]
    return slugs
      .map((slug) => {
        const purchased = purchasedByAgent.get(slug)?.seats ?? 0
        const bookingHeadsByDay = new Map<string, number>()
        for (const booking of bookings) {
          if (booking.agentSlug !== slug || !isActiveBooking(booking)) continue
          bookingHeadsByDay.set(
            booking.date,
            (bookingHeadsByDay.get(booking.date) ?? 0) + chargeablePax(booking),
          )
        }
        const days = [
          ...new Set([
            ...bookingHeadsByDay.keys(),
            ...daily.filter((row) => row.agentSlug === slug).map((row) => row.day),
          ]),
        ]
        const used = days.reduce((sum, day) => {
          const saved = dailyByAgentDay.get(`${slug}|${day}`)
          return sum + (saved !== undefined ? saved : bookingHeadsByDay.get(day) ?? 0)
        }, 0)
        const name =
          purchasedByAgent.get(slug)?.name ||
          agents.find((agent) => agent.slug === slug)?.name ||
          slug
        const rates = ratesForAgent(slug, name)
        const totalAmount = purchasedByAgent.get(slug)?.totalAmount ?? 0
        return {
          slug,
          name,
          purchased,
          used,
          left: purchased - used,
          adultPrice: rates.adultPrice,
          childPrice: rates.childPrice,
          totalAmount,
        }
      })
      .filter((row) => row.purchased > 0 || row.used > 0)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [agents, bookings, daily, dailyByAgentDay, filterAgent, purchasedByAgent, ratesByAgent])

  const hasActiveFilters = Boolean(
    filterDate ||
      filterAgent ||
      filterProgram ||
      filterChecker ||
      filterGuest.trim() ||
      filterVc.trim() ||
      extraFilters.length > 0 ||
      (filterMonth && filterMonth !== currentMonthValue()),
  )

  function clearExtraFilterValue(kind: FilterKind) {
    if (kind === 'program') setFilterProgram('')
    if (kind === 'checker') setFilterChecker('')
    if (kind === 'guest') setFilterGuest('')
    if (kind === 'vc') setFilterVc('')
  }

  function removeExtraFilter(kind: FilterKind) {
    clearExtraFilterValue(kind)
    setExtraFilters((current) => current.filter((item) => item !== kind))
  }

  function addExtraFilter(kind: FilterKind) {
    setExtraFilters((current) => (current.includes(kind) ? current : [...current, kind]))
    setAddFilterOpen(false)
  }

  function clearFilters() {
    setFilterDate('')
    setFilterMonth(currentMonthValue())
    setFilterAgent('')
    setFilterProgram('')
    setFilterChecker('')
    setFilterGuest('')
    setFilterVc('')
    setExtraFilters([])
  }

  const availableExtraFilters = EXTRA_FILTER_OPTIONS.filter(
    (option) => !extraFilters.includes(option.kind),
  )

  const bookingTotals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        if (line.vcNo === '—' && line.guestName === '—') return acc
        acc.adults += line.adults
        acc.children += line.children
        acc.amountAd += line.amountAd ?? 0
        acc.amountCh += line.amountCh ?? 0
        acc.totalAmount += lineTicketTotal(line) ?? 0
        acc.heads += line.totalHeadUse ?? 0
        return acc
      },
      { adults: 0, children: 0, amountAd: 0, amountCh: 0, totalAmount: 0, heads: 0 },
    )
  }, [lines])

  const reportPeriodLabel = filterDate
    ? formatShortDate(filterDate)
    : filterMonth
      ? formatMonthLabel(`${filterMonth}-01`)
      : 'All dates'

  const reportAgentLabel = filterAgent
    ? purchasedByAgent.get(filterAgent)?.name ||
      agents.find((agent) => agent.slug === filterAgent)?.name ||
      filterAgent
    : 'All agents'

  const printSummary = filterAgent
    ? balanceSummary.find((row) => row.slug === filterAgent) ?? balanceSummary[0]
    : balanceSummary.length === 1
      ? balanceSummary[0]
      : null

  function handlePrint() {
    if (lines.length === 0 && balanceSummary.length === 0) return
    const previousTitle = document.title
    document.title = `Allotment report · ${reportAgentLabel} · ${reportPeriodLabel}`
    let restored = false
    const restoreTitle = () => {
      if (restored) return
      restored = true
      document.title = previousTitle
      window.removeEventListener('afterprint', restoreTitle)
    }
    window.addEventListener('afterprint', restoreTitle)
    window.print()
    window.setTimeout(restoreTitle, 2000)
  }

  return (
    <div className="w-full">
      <div className="print:hidden">
      <PageHeader
        title="Allotment history"
        description="Each booking shows its AD+CH heads. Balance updates from bookings; Daily checker can confirm or adjust the day total."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handlePrint}
              disabled={lines.length === 0 && balanceSummary.length === 0}
            >
              <Printer className="size-3.5" />
              Print / PDF
            </Button>
            <Button type="button" size="sm" onClick={onAdd}>
              <Plus data-icon="inline-start" />
              Add allotment
            </Button>
          </div>
        }
      />

      <Surface className="mb-4 p-4 sm:p-5">
        <p className="mb-3 text-xs text-teal-900/45">
          Fill in order: <span className="font-medium text-teal-900/70">1. Date or Month</span>
          {' · '}
          <span className="font-medium text-teal-900/70">2. Agent</span>
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[9rem] space-y-1.5">
            <Label htmlFor="usage-filter-date" className="text-xs text-neutral-400">
              1a. Date
            </Label>
            <Input
              id="usage-filter-date"
              type="date"
              value={filterDate}
              onChange={(event) => {
                const next = event.target.value
                setFilterDate(next)
                if (next) setFilterMonth('')
              }}
              className="h-10"
            />
          </div>
          <div className="flex h-10 items-center px-1 text-xs font-medium text-teal-900/35">
            or
          </div>
          <div className="min-w-[9rem] space-y-1.5">
            <Label htmlFor="usage-filter-month" className="text-xs text-neutral-400">
              1b. Month
            </Label>
            <Input
              id="usage-filter-month"
              type="month"
              value={filterMonth}
              onChange={(event) => {
                const next = event.target.value
                setFilterMonth(next)
                if (next) setFilterDate('')
              }}
              onClick={(event) => {
                try {
                  event.currentTarget.showPicker?.()
                } catch {
                  /* older browsers */
                }
              }}
              className="h-10 cursor-pointer"
            />
          </div>
          <div className="min-w-[10rem] flex-1 space-y-1.5 sm:max-w-[14rem]">
            <Label htmlFor="usage-filter-agent" className="text-xs text-neutral-400">
              2. Agent
            </Label>
            <select
              id="usage-filter-agent"
              value={filterAgent}
              onChange={(event) => setFilterAgent(event.target.value)}
              className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
            >
              <option value="">All agents</option>
              {agentOptions.map((agent) => (
                <option key={agent.slug} value={agent.slug}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          {extraFilters.includes('program') ? (
            <div className="min-w-[8rem] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="usage-filter-program" className="text-xs text-neutral-400">
                  Program
                </Label>
                <button
                  type="button"
                  className="text-teal-900/35 hover:text-teal-900/70"
                  aria-label="Remove program filter"
                  onClick={() => removeExtraFilter('program')}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <select
                id="usage-filter-program"
                value={filterProgram}
                onChange={(event) => setFilterProgram(event.target.value as Program | '')}
                className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
              >
                <option value="">All programs</option>
                <option value="PP">PP</option>
                <option value="James Bond">James Bond</option>
              </select>
            </div>
          ) : null}

          {extraFilters.includes('checker') ? (
            <div className="min-w-[9rem] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="usage-filter-checker" className="text-xs text-neutral-400">
                  Checker
                </Label>
                <button
                  type="button"
                  className="text-teal-900/35 hover:text-teal-900/70"
                  aria-label="Remove checker filter"
                  onClick={() => removeExtraFilter('checker')}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <select
                id="usage-filter-checker"
                value={filterChecker}
                onChange={(event) => setFilterChecker(event.target.value as CheckerFilter)}
                className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
              >
                <option value="">All</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          ) : null}

          {extraFilters.includes('guest') ? (
            <div className="min-w-[9rem] flex-1 space-y-1.5 sm:max-w-[12rem]">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="usage-filter-guest" className="text-xs text-neutral-400">
                  Guest
                </Label>
                <button
                  type="button"
                  className="text-teal-900/35 hover:text-teal-900/70"
                  aria-label="Remove guest filter"
                  onClick={() => removeExtraFilter('guest')}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <Input
                id="usage-filter-guest"
                value={filterGuest}
                onChange={(event) => setFilterGuest(event.target.value)}
                placeholder="Guest name"
                className="h-10"
              />
            </div>
          ) : null}

          {extraFilters.includes('vc') ? (
            <div className="min-w-[9rem] flex-1 space-y-1.5 sm:max-w-[12rem]">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="usage-filter-vc" className="text-xs text-neutral-400">
                  VC No
                </Label>
                <button
                  type="button"
                  className="text-teal-900/35 hover:text-teal-900/70"
                  aria-label="Remove VC filter"
                  onClick={() => removeExtraFilter('vc')}
                >
                  <X className="size-3.5" />
                </button>
              </div>
              <Input
                id="usage-filter-vc"
                value={filterVc}
                onChange={(event) => setFilterVc(event.target.value)}
                placeholder="Voucher no."
                className="h-10"
              />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {availableExtraFilters.length > 0 ? (
              <Popover open={addFilterOpen} onOpenChange={setAddFilterOpen}>
                <PopoverTrigger
                  render={
                    <Button type="button" variant="outline" className="h-10 rounded-xl" />
                  }
                >
                  <Plus className="size-3.5" />
                  More
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 gap-1 p-2">
                  {availableExtraFilters.map((option) => (
                    <button
                      key={option.kind}
                      type="button"
                      className="flex w-full flex-col rounded-lg px-2.5 py-2 text-left hover:bg-teal-950/[0.04]"
                      onClick={() => addExtraFilter(option.kind)}
                    >
                      <span className="text-sm font-medium text-teal-950">{option.label}</span>
                      <span className="text-[11px] text-teal-900/45">{option.hint}</span>
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
            ) : null}
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-xl"
                onClick={clearFilters}
              >
                Reset
              </Button>
            ) : null}
          </div>
        </div>
      </Surface>

      {balanceSummary.length > 0 ? (
        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
          {balanceSummary.map((row) => (
            <Surface key={row.slug} className="px-4 py-3">
              <p className="text-sm font-semibold text-teal-950">{row.name}</p>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                <div>
                  <p className="text-teal-900/45">Price AD</p>
                  <p className="font-semibold tabular-nums text-teal-950">
                    {row.adultPrice > 0 ? `${formatMoney(row.adultPrice)} THB` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-teal-900/45">Price CH</p>
                  <p className="font-semibold tabular-nums text-teal-950">
                    {row.childPrice > 0 ? `${formatMoney(row.childPrice)} THB` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-teal-900/45">Lot total</p>
                  <p className="font-semibold tabular-nums text-teal-950">
                    {row.totalAmount > 0 ? `${formatMoney(row.totalAmount)} THB` : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-teal-900/45">Seat Left Balance</p>
                  <p
                    className={cn(
                      'font-semibold tabular-nums',
                      row.left <= 0 ? 'text-rose-600' : 'text-teal-800',
                    )}
                  >
                    {row.left}
                  </p>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-teal-900/45">
                Purchased {row.purchased} · Used {row.used}
              </p>
            </Surface>
          ))}
        </div>
      ) : null}

      {loadError ? (
        <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {loadError}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-teal-900/50">Loading usage history…</p> : null}

      {!loading && lines.length === 0 && !loadError ? (
        <Surface className="p-6 text-sm text-teal-900/55">
          No booking usage yet. Add allotment seats, then review usage here.
        </Surface>
      ) : null}

      {lines.length > 0 ? (
        <>
          <div className="mb-3 text-sm text-teal-900/60">
            <span className="font-semibold text-teal-950">{lines.length}</span> booking line
            {lines.length === 1 ? '' : 's'}
            <span className="mx-1.5">·</span>
            Heads = AD+CH per booking · gray until Daily checker is saved · Balance on last line of each day
          </div>

          <div className="space-y-3 md:hidden">
            {lines.map((line) => (
              <Surface key={line.key} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs text-teal-900/45">{formatShortDate(line.date)}</p>
                    <p
                      className="mt-0.5 break-all font-semibold leading-snug text-teal-950 [overflow-wrap:anywhere]"
                      title={line.vcNo}
                    >
                      {line.vcNo.includes('/')
                        ? line.vcNo.split('/').map((part, index, parts) => (
                            <span key={`${line.key}-m-vc-${index}`}>
                              {index > 0 ? '/' : ''}
                              {part}
                              {index < parts.length - 1 ? <br /> : null}
                            </span>
                          ))
                        : line.vcNo}
                    </p>
                    <p className="mt-1 text-sm text-teal-900/70">{line.guestName}</p>
                  </div>
                  <p className="text-xs tabular-nums text-teal-900/55">{line.paxLabel}</p>
                </div>
                <p className="mt-2 text-xs text-teal-900/55">
                  Adult{' '}
                  {line.adultPrice > 0 ? (
                    <span className="text-teal-900/40">({formatMoney(line.adultPrice)}) </span>
                  ) : null}
                  <span className="font-medium tabular-nums text-teal-950">
                    {line.amountAd === null
                      ? '—'
                      : line.adults === 0
                        ? '—'
                        : formatMoney(line.amountAd)}
                  </span>
                  <span className="mx-1.5 text-teal-900/30">·</span>
                  CH{' '}
                  {line.childPrice > 0 ? (
                    <span className="text-teal-900/40">({formatMoney(line.childPrice)}) </span>
                  ) : null}
                  <span className="font-medium tabular-nums text-teal-950">
                    {line.amountCh === null
                      ? '—'
                      : line.children === 0
                        ? '—'
                        : formatMoney(line.amountCh)}
                  </span>
                  <span className="mx-1.5 text-teal-900/30">·</span>
                  Total{' '}
                  <span className="font-semibold tabular-nums text-teal-950">
                    {(() => {
                      const total = lineTicketTotal(line)
                      if (total === null) return '—'
                      return formatMoney(total)
                    })()}
                  </span>
                </p>
                <p className="mt-2 text-sm text-teal-950">
                  Heads{' '}
                  <span
                    className={cn(
                      'tabular-nums',
                      line.checkerConfirmed
                        ? 'font-semibold text-teal-950'
                        : 'font-normal text-teal-900/35',
                    )}
                  >
                    {line.totalHeadUse === null ? '—' : line.totalHeadUse}
                  </span>
                  {line.isDayEnd ? (
                    <>
                      <span className="mx-1.5 text-teal-900/35">·</span>
                      Balance{' '}
                      <span
                        className={cn(
                          'tabular-nums',
                          !line.checkerConfirmed
                            ? 'font-normal text-teal-900/35'
                            : line.balance !== null && line.balance <= 0
                              ? 'font-semibold text-rose-600'
                              : 'font-semibold text-teal-800',
                        )}
                      >
                        {line.balance === null ? '—' : line.balance}
                      </span>
                    </>
                  ) : null}
                </p>
              </Surface>
            ))}
          </div>

          <Surface className="hidden overflow-x-auto md:block">
            <Table className="table-fixed">
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[6.5rem] px-2 text-teal-700/45">Date</TableHead>
                  <TableHead className="w-[8rem] px-2 text-teal-700/45">VC No</TableHead>
                  <TableHead className="w-[8rem] px-2 text-teal-700/45">Guest</TableHead>
                  <TableHead className="w-[6.5rem] px-2 text-teal-700/45">AD+CH+IF+TL</TableHead>
                  <TableHead className="w-[5.5rem] px-2 text-right text-teal-700/45">
                    {adultHeader}
                  </TableHead>
                  <TableHead className="w-[5.5rem] px-2 text-right text-teal-700/45">
                    {childHeader}
                  </TableHead>
                  <TableHead className="w-[5.5rem] px-2 text-right text-teal-700/45">
                    Total Amount
                  </TableHead>
                  <TableHead className="w-[4.5rem] px-2 text-right text-teal-700/45">Heads</TableHead>
                  <TableHead className="w-[5rem] px-2 text-right text-teal-700/45">Left</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow
                    key={line.key}
                    className={cn(line.isDayEnd && 'border-b-teal-900/15')}
                  >
                    <TableCell className="px-2 whitespace-nowrap">
                      {formatShortDate(line.date)}
                    </TableCell>
                    <TableCell className="w-[8rem] max-w-[8rem] whitespace-normal px-2">
                      <span
                        className="block w-full break-all font-medium leading-snug tabular-nums [overflow-wrap:anywhere]"
                        title={line.vcNo}
                      >
                        {line.vcNo.includes('/')
                          ? line.vcNo.split('/').map((part, index, parts) => (
                              <span key={`${line.key}-vc-${index}`}>
                                {index > 0 ? '/' : ''}
                                {part}
                                {index < parts.length - 1 ? <br /> : null}
                              </span>
                            ))
                          : line.vcNo}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-[8rem] truncate px-2" title={line.guestName}>
                      {line.guestName}
                    </TableCell>
                    <TableCell className="px-2 tabular-nums">{line.paxLabel}</TableCell>
                    <TableCell
                      className="px-2 text-right tabular-nums font-medium"
                      title={
                        line.amountAd === null || line.adultPrice <= 0
                          ? 'No allotment AD price for this agent'
                          : `${line.adults} × ${formatMoney(line.adultPrice)} = ${formatMoney(line.amountAd)}`
                      }
                    >
                      {line.amountAd === null
                        ? line.adults > 0
                          ? '—'
                          : ''
                        : formatMoney(line.amountAd)}
                    </TableCell>
                    <TableCell
                      className="px-2 text-right tabular-nums font-medium"
                      title={
                        line.amountCh === null || line.childPrice <= 0
                          ? 'No allotment CH price for this agent'
                          : `${line.children} × ${formatMoney(line.childPrice)} = ${formatMoney(line.amountCh)}`
                      }
                    >
                      {line.amountCh === null
                        ? line.children > 0
                          ? '—'
                          : '—'
                        : line.children === 0
                          ? '—'
                          : formatMoney(line.amountCh)}
                    </TableCell>
                    <TableCell
                      className="px-2 text-right tabular-nums font-semibold text-teal-950"
                      title={
                        (() => {
                          const total = lineTicketTotal(line)
                          if (total === null) return 'No allotment AD/CH price for this agent'
                          const ad = line.amountAd ?? 0
                          const ch = line.amountCh ?? 0
                          return `${formatMoney(ad)} + ${formatMoney(ch)} = ${formatMoney(total)}`
                        })()
                      }
                    >
                      {(() => {
                        const total = lineTicketTotal(line)
                        if (total === null) {
                          return line.adults > 0 || line.children > 0 ? '—' : ''
                        }
                        return formatMoney(total)
                      })()}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'px-2 text-right tabular-nums',
                        line.checkerConfirmed
                          ? 'font-semibold text-teal-950'
                          : 'font-normal text-teal-900/35',
                      )}
                    >
                      {line.totalHeadUse === null ? '' : line.totalHeadUse}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'px-2 text-right tabular-nums',
                        !line.isDayEnd
                          ? ''
                          : !line.checkerConfirmed
                            ? 'font-normal text-teal-900/35'
                            : line.balance !== null && line.balance <= 0
                              ? 'font-semibold text-rose-600'
                              : 'font-semibold text-teal-900',
                      )}
                    >
                      {line.isDayEnd
                        ? line.balance === null
                          ? '—'
                          : line.balance
                        : ''}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="border-t-2 border-teal-900/15 bg-teal-950/[0.03] hover:bg-teal-950/[0.03]">
                  <TableCell className="px-2 font-semibold text-teal-950" colSpan={3}>
                    Booking total
                  </TableCell>
                  <TableCell className="px-2 tabular-nums font-semibold text-teal-950">
                    {bookingTotals.adults}+{bookingTotals.children}
                  </TableCell>
                  <TableCell className="px-2 text-right font-semibold tabular-nums text-teal-950">
                    {formatMoney(bookingTotals.amountAd)}
                  </TableCell>
                  <TableCell className="px-2 text-right font-semibold tabular-nums text-teal-950">
                    {formatMoney(bookingTotals.amountCh)}
                  </TableCell>
                  <TableCell className="px-2 text-right font-semibold tabular-nums text-teal-950">
                    {formatMoney(bookingTotals.totalAmount)}
                  </TableCell>
                  <TableCell className="px-2 text-right font-semibold tabular-nums text-teal-950">
                    {bookingTotals.heads}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableBody>
            </Table>
          </Surface>
        </>
      ) : null}
      </div>

      <div className="allotment-print-sheet hidden print:block">
        <header className="mb-4 border-b-2 border-teal-900/20 pb-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-teal-700/70 uppercase">
                {BRAND_SHORT} · Prebuy allotment report
              </p>
              <h1 className="mt-1 text-xl font-bold tracking-tight text-teal-950">
                {reportAgentLabel}
              </h1>
              <p className="mt-0.5 text-sm font-semibold text-teal-900">{reportPeriodLabel}</p>
            </div>
            <div className="text-right text-[10px] leading-relaxed text-teal-900/55">
              <p>{BRAND_LEGAL}</p>
              <p>Printed {formatShortDate(todayISO())}</p>
              <p>
                {lines.filter((line) => !(line.vcNo === '—' && line.guestName === '—')).length}{' '}
                booking lines
              </p>
            </div>
          </div>
        </header>

        {printSummary ? (
          <section className="mb-4 grid grid-cols-4 gap-2 rounded-lg border border-teal-900/15 bg-teal-950/[0.03] p-3">
            <div>
              <p className="text-[9px] font-semibold tracking-wide text-teal-900/45 uppercase">
                AD price
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-teal-950">
                {printSummary.adultPrice > 0
                  ? `${formatMoney(printSummary.adultPrice)} THB`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-semibold tracking-wide text-teal-900/45 uppercase">
                CH price
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-teal-950">
                {printSummary.childPrice > 0
                  ? `${formatMoney(printSummary.childPrice)} THB`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-semibold tracking-wide text-teal-900/45 uppercase">
                Allotment amount
              </p>
              <p className="mt-0.5 text-sm font-bold tabular-nums text-teal-950">
                {printSummary.totalAmount > 0
                  ? `${formatMoney(printSummary.totalAmount)} THB`
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-semibold tracking-wide text-teal-900/45 uppercase">
                Heads left
              </p>
              <p
                className={cn(
                  'mt-0.5 text-sm font-bold tabular-nums',
                  printSummary.left <= 0 ? 'text-rose-700' : 'text-teal-950',
                )}
              >
                {printSummary.left}
              </p>
              <p className="text-[9px] text-teal-900/45">
                Bought {printSummary.purchased} · Used {printSummary.used}
              </p>
            </div>
          </section>
        ) : balanceSummary.length > 1 ? (
          <section className="mb-4 grid grid-cols-2 gap-2">
            {balanceSummary.map((row) => (
              <div
                key={`print-${row.slug}`}
                className="rounded-lg border border-teal-900/12 bg-teal-950/[0.03] px-2.5 py-2"
              >
                <p className="text-[11px] font-semibold text-teal-950">{row.name}</p>
                <p className="mt-1 text-[9px] text-teal-900/55">
                  AD {row.adultPrice > 0 ? formatMoney(row.adultPrice) : '—'} · CH{' '}
                  {row.childPrice > 0 ? formatMoney(row.childPrice) : '—'} · Amount{' '}
                  {row.totalAmount > 0 ? `${formatMoney(row.totalAmount)} THB` : '—'}
                </p>
                <p className="mt-0.5 text-[10px] font-semibold tabular-nums text-teal-950">
                  Left {row.left}
                  <span className="ml-1.5 font-normal text-teal-900/45">
                    (bought {row.purchased} · used {row.used})
                  </span>
                </p>
              </div>
            ))}
          </section>
        ) : null}

        {lines.length === 0 ? (
          <p className="py-8 text-center text-sm text-neutral-500">No booking lines in this range.</p>
        ) : (
          <table className="w-full border-collapse text-left text-[9.5px] leading-tight">
            <thead>
              <tr className="bg-teal-950/[0.07]">
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold uppercase">Date</th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold uppercase">VC No</th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold uppercase">Guest</th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 font-bold uppercase">Pax</th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 text-right font-bold uppercase">
                  Adult
                </th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 text-right font-bold uppercase">
                  CH
                </th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 text-right font-bold uppercase">
                  Total
                </th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 text-right font-bold uppercase">
                  Heads
                </th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 text-right font-bold uppercase">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => (
                <tr
                  key={`print-${line.key}`}
                  className={cn(line.isDayEnd && 'border-b-2 border-b-teal-900/20')}
                >
                  <td className="border border-teal-900/10 px-1.5 py-1 whitespace-nowrap">
                    {formatShortDate(line.date)}
                  </td>
                  <td className="border border-teal-900/10 px-1.5 py-1 font-medium break-all">
                    {line.vcNo}
                  </td>
                  <td className="border border-teal-900/10 px-1.5 py-1">{line.guestName}</td>
                  <td className="border border-teal-900/10 px-1.5 py-1 tabular-nums">
                    {line.paxLabel}
                  </td>
                  <td className="border border-teal-900/10 px-1.5 py-1 text-right tabular-nums">
                    {line.amountAd === null || line.adults === 0
                      ? '—'
                      : formatMoney(line.amountAd)}
                  </td>
                  <td className="border border-teal-900/10 px-1.5 py-1 text-right tabular-nums">
                    {line.amountCh === null || line.children === 0
                      ? '—'
                      : formatMoney(line.amountCh)}
                  </td>
                  <td className="border border-teal-900/10 px-1.5 py-1 text-right tabular-nums font-semibold">
                    {(() => {
                      const total = lineTicketTotal(line)
                      if (total === null) {
                        return line.adults > 0 || line.children > 0 ? '—' : ''
                      }
                      return formatMoney(total)
                    })()}
                  </td>
                  <td
                    className={cn(
                      'border border-teal-900/10 px-1.5 py-1 text-right tabular-nums',
                      !line.checkerConfirmed && 'text-teal-900/40',
                    )}
                  >
                    {line.totalHeadUse === null ? '' : line.totalHeadUse}
                  </td>
                  <td
                    className={cn(
                      'border border-teal-900/10 px-1.5 py-1 text-right tabular-nums font-semibold',
                      line.isDayEnd &&
                        line.balance !== null &&
                        line.balance <= 0 &&
                        'text-rose-700',
                      line.isDayEnd && !line.checkerConfirmed && 'font-normal text-teal-900/40',
                    )}
                  >
                    {line.isDayEnd
                      ? line.balance === null
                        ? '—'
                        : line.balance
                      : ''}
                  </td>
                </tr>
              ))}
              <tr className="bg-teal-50 font-semibold">
                <td className="border border-teal-900/15 px-1.5 py-1.5" colSpan={3}>
                  Booking total
                </td>
                <td className="border border-teal-900/15 px-1.5 py-1.5 tabular-nums">
                  {bookingTotals.adults}+{bookingTotals.children}
                </td>
                <td className="border border-teal-900/15 px-1.5 py-1.5 text-right tabular-nums">
                  {formatMoney(bookingTotals.amountAd)}
                </td>
                <td className="border border-teal-900/15 px-1.5 py-1.5 text-right tabular-nums">
                  {formatMoney(bookingTotals.amountCh)}
                </td>
                <td className="border border-teal-900/15 px-1.5 py-1.5 text-right tabular-nums">
                  {formatMoney(bookingTotals.totalAmount)}
                </td>
                <td className="border border-teal-900/15 px-1.5 py-1.5 text-right tabular-nums">
                  {bookingTotals.heads}
                </td>
                <td className="border border-teal-900/15 px-1.5 py-1.5" />
              </tr>
            </tbody>
          </table>
        )}

        <footer className="mt-4 border-t border-teal-900/15 pt-2 text-[9px] text-teal-900/45">
          Gray heads / balance = Daily checker not confirmed yet. Amounts use the agent&apos;s
          allotment AD/CH price. Save as PDF from the print dialog.
        </footer>
      </div>

      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm;
          }
          html, body {
            background: white !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          .allotment-print-sheet,
          .allotment-print-sheet * {
            visibility: visible !important;
          }
          .allotment-print-sheet {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: white !important;
            z-index: 99999 !important;
          }
        }
      `}</style>
    </div>
  )
}
