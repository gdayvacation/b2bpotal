'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, Plus, Printer } from 'lucide-react'
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
import { BRAND_LEGAL, BRAND_SHORT } from '@/lib/brand'
import { formatMonthLabel, formatShortDate, todayISO } from '@/lib/format'
import { listAgentAllotments, type AgentAllotment } from '@/lib/supabase/agent-allotment-db'
import {
  chargeablePax,
  formatPaxBreakdown,
  isActiveBooking,
  type Booking,
  type Program,
} from '@/lib/types'
import { cn } from '@/lib/utils'


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
  /** Running seats left after this event. */
  balance: number | null
  isDayEnd: boolean
  /** Sum of all chargeable heads on this date. Only set on isDayEnd rows. */
  dayTotalHeads: number | null
  /** True when this row represents an allotment purchase (credit / top-up). */
  isTopUp?: true
  /** Number of seats added by this top-up purchase. */
  topUpSeats?: number
  /** THB amount paid for this top-up. */
  topUpAmount?: number
  /** Human label for the lot, e.g. "Lot 2 · 5 Oct 2026". */
  topUpLabel?: string
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

type LotCard = {
  lot: AgentAllotment
  /** 1 = oldest, N = newest for this agent. */
  lotIndex: number
  totalLots: number
  /** First tour date included (null = from the very beginning). */
  startDate: string | null
  /** Last tour date included (inclusive). */
  endDate: string
  used: number
  /** Unused seats rolled in from the immediately preceding lot (≥ 0). */
  carryIn: number
  /** lot.seats + carryIn — the true available capacity for this period. */
  effectiveSeats: number
  /** effectiveSeats − used — positive = seats remaining, negative = overspent. */
  left: number
  /** Seats carried OUT to the next lot (0 for the last lot). */
  carryOut: number
  /**
   * What to show as "Left" on the card.
   * = 0 when this lot's remaining seats are all carried to the next lot (fully consumed).
   * = left when this is the last lot (shows true balance, positive or negative).
   * = negative when this lot was overspent (no carry possible).
   */
  displayLeft: number
}

function isoSubtractDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d - 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [filterProgram, setFilterProgram] = useState<Program | ''>(program)
  const [filterGuest, setFilterGuest] = useState('')
  const [filterVc, setFilterVc] = useState('')
  const [selectedLotIds, setSelectedLotIds] = useState<string[]>([])
  const [expandedAgentSlug, setExpandedAgentSlug] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        const nextPurchases = await listAgentAllotments()
        if (!cancelled) {
          setPurchases(nextPurchases)
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

  /** All lots for this program with their date range and real-time usage. */
  const lotCards = useMemo<LotCard[]>(() => {
    const byAgent = new Map<string, AgentAllotment[]>()
    for (const lot of purchases) {
      if (lot.program !== program) continue
      const existing = byAgent.get(lot.agentSlug) ?? []
      byAgent.set(lot.agentSlug, [...existing, lot])
    }
    const today = todayISO()
    const result: LotCard[] = []

    for (const [agentSlug, agentLots] of byAgent.entries()) {
      // Sort oldest → newest
      const sorted = [...agentLots].sort((a, b) => {
        const aDate = a.paidDate || a.createdAt.slice(0, 10)
        const bDate = b.paidDate || b.createdAt.slice(0, 10)
        return aDate.localeCompare(bDate)
      })

      // All bookings for this agent sorted chronologically (sequential seat-consumption model)
      let bookingPool = bookings
        .filter((b) => b.agentSlug === agentSlug && isActiveBooking(b) && b.date <= today)
        .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))

      // Sequential carry: remaining seats from previous lot roll into the next
      let seqCarryIn = 0

      for (let i = 0; i < sorted.length; i++) {
        const lot = sorted[i]
        const nextLot = sorted[i + 1]
        const isLastLot = i === sorted.length - 1

        // Date metadata (used only for display / date range shown on lot card)
        const lotStart = lot.paidDate || lot.createdAt.slice(0, 10)
        const endDate = nextLot
          ? isoSubtractDay(nextLot.paidDate || nextLot.createdAt.slice(0, 10))
          : today
        const startDate = i === 0 ? null : lotStart

        // Seat budget = this lot's purchased seats + whatever rolled in from the previous lot
        const carryIn = seqCarryIn
        const effectiveSeats = lot.seats + carryIn

        // Greedily assign bookings to this lot until budget exhausted;
        // too-large (doesn't fit) bookings spill over to the next lot.
        let used = 0
        const overflow: Booking[] = []

        if (isLastLot) {
          // Last lot absorbs every remaining booking (may go negative)
          used = bookingPool.reduce((s, bk) => s + chargeablePax(bk), 0)
          bookingPool = []
        } else {
          let remaining = effectiveSeats
          for (const bk of bookingPool) {
            const heads = chargeablePax(bk)
            if (remaining >= heads) {
              used += heads
              remaining -= heads
            } else {
              overflow.push(bk)
            }
          }
          bookingPool = overflow
          seqCarryIn = Math.max(0, remaining) // positive remainder carries to next lot
        }

        const left = effectiveSeats - used
        const carryOut = isLastLot ? 0 : Math.max(0, left)
        const displayLeft = left - carryOut // 0 when all seats carry forward, negative if overspent

        result.push({
          lot,
          lotIndex: i + 1,
          totalLots: sorted.length,
          startDate,
          endDate,
          used,
          carryIn,
          effectiveSeats,
          left,
          carryOut,
          displayLeft,
        })
      }
    }

    // Sort: newest lot first, then by agent name
    return result.sort((a, b) => {
      const aDate = a.lot.paidDate || a.lot.createdAt.slice(0, 10)
      const bDate = b.lot.paidDate || b.lot.createdAt.slice(0, 10)
      return bDate.localeCompare(aDate) || a.lot.agentName.localeCompare(b.lot.agentName)
    })
  }, [purchases, bookings, program])

  /** Per-agent summary groups, sorted by most-recent lot date. */
  const agentGroups = useMemo(() => {
    const map = new Map<string, { agentSlug: string; agentName: string; lots: LotCard[] }>()
    for (const lc of lotCards) {
      const slug = lc.lot.agentSlug
      if (!map.has(slug)) map.set(slug, { agentSlug: slug, agentName: lc.lot.agentName, lots: [] })
      map.get(slug)!.lots.push(lc)
    }
    return [...map.values()].sort((a, b) => {
      // Sort by most-recent lot date descending
      const aDate = a.lots[a.lots.length - 1].lot.paidDate || a.lots[a.lots.length - 1].lot.createdAt.slice(0, 10)
      const bDate = b.lots[b.lots.length - 1].lot.paidDate || b.lots[b.lots.length - 1].lot.createdAt.slice(0, 10)
      return bDate.localeCompare(aDate) || a.agentName.localeCompare(b.agentName)
    })
  }, [lotCards])

  // Derive the ordered array of selected lot cards (preserving lot order oldest→newest)
  const selectedLotCards = useMemo(
    () =>
      lotCards
        .filter((lc) => selectedLotIds.includes(lc.lot.id))
        // stable sort: oldest lot first for balance accumulation
        .sort((a, b) => {
          const aDate = a.lot.paidDate || a.lot.createdAt.slice(0, 10)
          const bDate = b.lot.paidDate || b.lot.createdAt.slice(0, 10)
          return aDate.localeCompare(bDate)
        }),
    [lotCards, selectedLotIds],
  )

  const isMerged = selectedLotCards.length > 1

  // Combined stats across all selected lots
  // "Purchased" = actual seats bought (for amount display)
  const mergedPurchased = selectedLotCards.reduce((s, lc) => s + lc.lot.seats, 0)
  const mergedUsed = selectedLotCards.reduce((s, lc) => s + lc.used, 0)
  const mergedEffective = selectedLotCards.reduce((s, lc) => s + lc.effectiveSeats, 0)
  // mergedLeft: only the last lot's left contributes true balance (earlier lots cancel via carry)
  const mergedLeft = selectedLotCards.length === 0
    ? 0
    : selectedLotCards[selectedLotCards.length - 1].left
  const mergedAmount = selectedLotCards.reduce(
    (s, lc) => s + Math.max(0, Number(lc.lot.totalAmount) || 0),
    0,
  )

  const adultHeader = 'Adult'
  const childHeader = 'CH'

  function toggleLot(id: string) {
    setSelectedLotIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function selectAgentLots(agentSlug: string) {
    const ids = lotCards.filter((lc) => lc.lot.agentSlug === agentSlug).map((lc) => lc.lot.id)
    setSelectedLotIds((prev) => {
      const alreadyAll = ids.every((id) => prev.includes(id))
      if (alreadyAll) return prev.filter((id) => !ids.includes(id))
      return [...new Set([...prev, ...ids])]
    })
  }

  const lines = useMemo<HistoryLine[]>(() => {
    if (selectedLotCards.length === 0) return []

    const today = todayISO()
    const guestQ = filterGuest.trim().toLowerCase()
    const vcQ = filterVc.trim().toLowerCase()

    // ─────────────────────────────────────────────────────────────────────────
    // LEDGER APPROACH: balance = Σ(credits) − Σ(debits) up to each date
    //   credits = lot seat purchases (top-ups), sorted oldest → newest
    //   debits  = chargeable booking heads per day
    // ─────────────────────────────────────────────────────────────────────────

    // 1. Collect all booking-heads-per-day across all selected lots (unfiltered for balance)
    const rawHeadsByDay = new Map<string, number>()
    for (const lc of selectedLotCards) {
      const effectiveStart = lc.startDate ?? '0000-00-00'
      for (const bk of bookings) {
        if (bk.agentSlug !== lc.lot.agentSlug || !isActiveBooking(bk)) continue
        if (bk.date > today || bk.date > lc.endDate || bk.date < effectiveStart) continue
        rawHeadsByDay.set(bk.date, (rawHeadsByDay.get(bk.date) ?? 0) + chargeablePax(bk))
      }
    }

    // 2. Build top-up events — one per selected lot (sorted oldest → newest)
    type TopUpEvent = {
      date: string
      seats: number          // actual new seats in this lot
      carryIn: number        // seats rolled in from the previous lot (≥ 0)
      amount: number
      label: string
      agentSlug: string
      agentName: string
      lotCard: LotCard
    }
    const topUpEvents: TopUpEvent[] = selectedLotCards.map((lc) => ({
      date: lc.lot.paidDate || lc.lot.createdAt.slice(0, 10),
      seats: lc.lot.seats,
      carryIn: lc.carryIn,
      amount: Math.max(0, Number(lc.lot.totalAmount) || 0),
      label: `Lot ${lc.lotIndex}${lc.totalLots > 1 ? ` / ${lc.totalLots}` : ''} · ${formatShortDate(lc.lot.paidDate || lc.lot.createdAt.slice(0, 10))}`,
      agentSlug: lc.lot.agentSlug,
      agentName: lc.lot.agentName,
      lotCard: lc,
    }))

    // 3. Build a sorted list of all unique event dates (top-up + booking days)
    const topUpByDate = new Map<string, TopUpEvent[]>()
    for (const ev of topUpEvents) {
      topUpByDate.set(ev.date, [...(topUpByDate.get(ev.date) ?? []), ev])
    }

    const allEventDates = [
      ...new Set([...rawHeadsByDay.keys(), ...topUpByDate.keys()]),
    ].sort() // oldest → newest

    // 4. Walk oldest → newest, accumulating the running balance
    let runningBalance = 0
    type DateSnapshot = {
      date: string
      topUps: Array<TopUpEvent & { carryBalanceAfter: number; balanceAfter: number }>
      dayHeads: number
      balanceAfterDay: number
    }
    const snapshots: DateSnapshot[] = []

    for (const date of allEventDates) {
      if (date > today) continue

      const topUpsToday = topUpByDate.get(date) ?? []
      type TopUpWithBalance = TopUpEvent & { carryBalanceAfter: number; balanceAfter: number }
      const topUpsWithBalance: TopUpWithBalance[] = []
      for (const ev of topUpsToday) {
        // First apply carry-in (if any) — seats that rolled over from previous lot
        if (ev.carryIn > 0) runningBalance += ev.carryIn
        const carryBalanceAfter = runningBalance
        // Then add the new lot's own seats
        runningBalance += ev.seats
        topUpsWithBalance.push({ ...ev, carryBalanceAfter, balanceAfter: runningBalance })
      }

      const dayHeads = rawHeadsByDay.get(date) ?? 0
      runningBalance -= dayHeads

      snapshots.push({
        date,
        topUps: topUpsWithBalance,
        dayHeads,
        balanceAfterDay: runningBalance,
      })
    }

    // 5. Collect display bookings (program / guest / vc filtered)
    const displayBookings: (Booking & { _lc: LotCard })[] = []
    for (const lc of selectedLotCards) {
      const effectiveStart = lc.startDate ?? '0000-00-00'
      for (const bk of bookings) {
        if (bk.agentSlug !== lc.lot.agentSlug || !isActiveBooking(bk)) continue
        if (bk.date > today || bk.date > lc.endDate || bk.date < effectiveStart) continue
        if (filterProgram && bk.program !== filterProgram) continue
        if (guestQ && !bk.leadGuest.toLowerCase().includes(guestQ)) continue
        if (vcQ && !(bk.agentRef.trim() || '').toLowerCase().includes(vcQ)) continue
        displayBookings.push({ ...bk, _lc: lc })
      }
    }
    displayBookings.sort(
      (a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code),
    )

    // 6. Build HistoryLine rows from snapshots (display order: newest → oldest)
    const result: HistoryLine[] = []

    for (const snap of [...snapshots].reverse()) {
      const { date, topUps, dayHeads, balanceAfterDay } = snap
      const dayBookings = displayBookings.filter((b) => b.date === date)

      // ── Booking rows ──
      dayBookings.forEach((booking, index) => {
        const isLast = index === dayBookings.length - 1
        const agentSlug = booking.agentSlug
        const agentName =
          purchasedByAgent.get(agentSlug)?.name ||
          agents.find((a) => a.slug === agentSlug)?.name ||
          agentSlug
        const rates = ratesForAgent(agentSlug, agentName)
        const adults = Math.max(0, booking.adults)
        const children = Math.max(0, booking.children)

        result.push({
          key: `${booking.code}|${date}`,
          date,
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
          balance: isLast ? balanceAfterDay : null,
          isDayEnd: isLast,
          dayTotalHeads: isLast ? dayHeads : null,
        })
      })

      // ── Top-up + carry-in rows for this date (shown after booking rows in newest-first view,
      //    because the credit happened before the day's bookings chronologically) ──
      for (const ev of [...topUps].reverse()) {
        // The new-lot purchase row
        result.push({
          key: `topup|${ev.lotCard.lot.id}|${date}`,
          date,
          vcNo: '—',
          agentSlug: ev.agentSlug,
          agentName: ev.agentName,
          guestName: '—',
          bookingLabel: '',
          paxLabel: '',
          program: null,
          adults: 0,
          children: 0,
          adultPrice: 0,
          childPrice: 0,
          amountAd: null,
          amountCh: null,
          totalHeadUse: null,
          balance: ev.balanceAfter,
          isDayEnd: false,
          dayTotalHeads: null,
          isTopUp: true,
          topUpSeats: ev.seats,
          topUpAmount: ev.amount,
          topUpLabel: ev.label,
        })

        // Carry-in row — shown immediately before the top-up row (below it in newest-first display)
        if (ev.carryIn > 0) {
          const prevLotIndex = ev.lotCard.lotIndex - 1
          result.push({
            key: `carryin|${ev.lotCard.lot.id}|${date}`,
            date,
            vcNo: '—',
            agentSlug: ev.agentSlug,
            agentName: ev.agentName,
            guestName: '—',
            bookingLabel: '',
            paxLabel: '',
            program: null,
            adults: 0,
            children: 0,
            adultPrice: 0,
            childPrice: 0,
            amountAd: null,
            amountCh: null,
            totalHeadUse: null,
            balance: ev.carryBalanceAfter,
            isDayEnd: false,
            dayTotalHeads: null,
            isTopUp: true,
            topUpSeats: ev.carryIn,
            topUpAmount: 0,
            topUpLabel: `Carry over from Lot ${prevLotIndex}`,
          })
        }
      }
    }

    return result
  }, [
    agents,
    bookings,
    filterGuest,
    filterProgram,
    filterVc,
    purchasedByAgent,
    ratesByAgent,
    selectedLotCards,
  ])


  const hasNarrowFilters = Boolean(filterProgram || filterGuest.trim() || filterVc.trim())

  function clearNarrowFilters() {
    setFilterProgram('')
    setFilterGuest('')
    setFilterVc('')
  }

  // ── Per-lot section data (for the new stacked-section screen view) ──
  type DayView = {
    date: string
    bookings: Booking[]
    dayHeads: number
    balanceAfterDay: number
  }
  type LotView = {
    lotCard: LotCard
    days: DayView[]  // oldest → newest
  }

  const lotViews = useMemo<LotView[]>(() => {
    if (!expandedAgentSlug) return []
    const group = agentGroups.find((g) => g.agentSlug === expandedAgentSlug)
    if (!group) return []
    const todayCap = todayISO()

    // All bookings for this agent, chronological order (date ASC, then booking code for stability)
    let bookingPool = bookings
      .filter((bk) => bk.agentSlug === expandedAgentSlug && isActiveBooking(bk) && bk.date <= todayCap)
      .sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code))

    // Lots oldest → newest
    const lotsOldest = [...group.lots].sort((a, b) => a.lotIndex - b.lotIndex)

    // Sequential seat-consumption:
    // Each lot absorbs bookings until its budget (lot.seats + seqCarryIn) is exhausted.
    // Any booking that fits (remainingBudget ≥ heads) is assigned; too-large ones skip to
    // the next lot. The last lot takes everything remaining (may go negative).
    let seqCarryIn = 0

    const views: LotView[] = lotsOldest.map((lc, i) => {
      const isLastLot = i === lotsOldest.length - 1
      const budget = lc.lot.seats + seqCarryIn

      const lotBookings: Booking[] = []
      const overflow: Booking[] = []

      if (isLastLot) {
        lotBookings.push(...bookingPool)
      } else {
        let remaining = budget
        for (const bk of bookingPool) {
          const heads = chargeablePax(bk)
          if (remaining >= heads) {
            lotBookings.push(bk)
            remaining -= heads
          } else {
            overflow.push(bk)
          }
        }
        // What's left after filling this lot becomes carry-in for the next lot
        seqCarryIn = Math.max(0, remaining)
      }
      bookingPool = overflow

      const usedSeats = lotBookings.reduce((s, bk) => s + chargeablePax(bk), 0)
      const seqLeft = budget - usedSeats
      const seqCarryOut = isLastLot ? 0 : Math.max(0, seqLeft)

      // Build the per-day breakdown, balance counts down from budget
      const dayDates = [...new Set(lotBookings.map((b) => b.date))].sort()
      let runningBalance = budget
      const days: DayView[] = dayDates.map((date) => {
        const dayBookings = lotBookings.filter((b) => b.date === date)
        const dayHeads = dayBookings.reduce((s, b) => s + chargeablePax(b), 0)
        runningBalance -= dayHeads
        return { date, bookings: dayBookings, dayHeads, balanceAfterDay: runningBalance }
      })

      // Override lotCard fields with sequential-allocation values for display
      const seqLotCard: LotCard = {
        ...lc,
        carryIn: isLastLot ? 0 : lc.carryIn,  // keep original for carry pill display on lots 2+
        effectiveSeats: budget,
        used: usedSeats,
        left: seqLeft,
        carryOut: seqCarryOut,
        displayLeft: seqCarryOut > 0 ? 0 : seqLeft,
      }

      return { lotCard: seqLotCard, days }
    })

    return views
  }, [expandedAgentSlug, agentGroups, bookings])

  const bookingTotals = useMemo(() => {
    return lines.reduce(
      (acc, line) => {
        if (line.isTopUp) return acc
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

  const today = todayISO()

  // Report label helpers
  const uniqueAgentNames = [...new Set(selectedLotCards.map((lc) => lc.lot.agentName))]
  const reportAgentLabel =
    uniqueAgentNames.length === 0
      ? 'All agents'
      : uniqueAgentNames.length === 1
        ? uniqueAgentNames[0]
        : uniqueAgentNames.join(' + ')

  const reportPeriodLabel =
    selectedLotCards.length === 0
      ? 'All dates'
      : (() => {
          const starts = selectedLotCards.map((lc) => lc.startDate ?? '0000-00-00')
          const ends = selectedLotCards.map((lc) => lc.endDate)
          const minStart = starts.reduce((a, b) => (a < b ? a : b))
          const maxEnd = ends.reduce((a, b) => (a > b ? a : b))
          return [
            minStart === '0000-00-00' ? 'start' : formatShortDate(minStart),
            '–',
            maxEnd >= today ? 'today' : formatShortDate(maxEnd),
          ].join(' ')
        })()

  const printSummary =
    selectedLotCards.length > 0
      ? {
          adultPrice: selectedLotCards[0].lot.adultPrice,
          childPrice: selectedLotCards[0].lot.childPrice,
          totalAmount: mergedAmount,
          purchased: mergedPurchased,
          used: mergedUsed,
          left: mergedLeft,   // displayLeft-based: last lot balance, others 0
        }
      : null

  function handlePrint() {
    if (lines.length === 0 && selectedLotCards.length === 0) return
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
        description="Each booking shows its AD+CH heads. Balance auto-syncs from confirmed bookings up to today."
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
              disabled={lines.length === 0}
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

      {/* ── Agent → Lot picker (2-level) ── */}
      <div className="mb-4">

        {/* ── Level 1: Agent summary cards (shown when no agent expanded) ── */}
        {!expandedAgentSlug && !loading && (
          <>
            <p className="mb-2.5 text-xs font-medium text-teal-900/50">
              Select an agent to view their allotment lots
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {agentGroups.map((group) => {
                const lastLot = group.lots[group.lots.length - 1]
                const totalSeats = group.lots.reduce((s, lc) => s + lc.lot.seats, 0)
                const totalUsed = group.lots.reduce((s, lc) => s + lc.used, 0)
                const finalLeft = lastLot.left  // carry-aware final balance
                const totalAmount = group.lots.reduce((s, lc) => s + Math.max(0, Number(lc.lot.totalAmount) || 0), 0)
                const hasActive = group.lots.some((lc) => lc.lot.receivesBookings)
                const nSelected = group.lots.filter((lc) => selectedLotIds.includes(lc.lot.id)).length

                return (
                  <button
                    key={group.agentSlug}
                    type="button"
                    onClick={() => setExpandedAgentSlug(group.agentSlug)}
                    className="w-full rounded-[1.35rem] border border-teal-900/10 bg-white p-4 text-left transition-all hover:border-teal-900/20 hover:shadow-sm sm:p-5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] text-teal-900/45">
                          {group.lots.length} lot{group.lots.length > 1 ? 's' : ''}
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-teal-950">
                          {group.agentName}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {hasActive && (
                          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                            Active
                          </span>
                        )}
                        {nSelected > 0 && (
                          <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                            {nSelected} selected
                          </span>
                        )}
                        {/* Chevron */}
                        <svg viewBox="0 0 6 10" fill="none" className="mt-0.5 size-3 text-teal-900/30">
                          <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-x-3 text-xs">
                      <div>
                        <p className="text-teal-900/40">Seats</p>
                        <p className="font-semibold tabular-nums text-teal-950">{totalSeats}</p>
                      </div>
                      <div>
                        <p className="text-teal-900/40">Used</p>
                        <p className="font-semibold tabular-nums text-teal-950">{totalUsed}</p>
                      </div>
                      <div>
                        <p className="text-teal-900/40">Left</p>
                        <p className={cn('font-semibold tabular-nums', finalLeft <= 0 ? 'text-rose-600' : 'text-teal-700')}>
                          {finalLeft}
                        </p>
                      </div>
                    </div>
                    {totalAmount > 0 && (
                      <p className="mt-2 text-[10px] text-teal-900/35">
                        {formatMoney(totalAmount)} THB total
                      </p>
                    )}
                  </button>
                )
              })}
            </div>
          </>
        )}

        {/* ── Level 2: Lot cards for expanded agent ── */}
        {expandedAgentSlug && !loading && (() => {
          const group = agentGroups.find((g) => g.agentSlug === expandedAgentSlug)
          if (!group) return null
          const allSelected = group.lots.every((lc) => selectedLotIds.includes(lc.lot.id))

          return (
            <div>
              {/* Back + header row */}
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setExpandedAgentSlug(null)}
                    className="flex items-center gap-1 text-xs text-teal-700 hover:underline"
                  >
                    <svg viewBox="0 0 6 10" fill="none" className="size-2.5 rotate-180">
                      <path d="M1 1l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    All agents
                  </button>
                  <span className="text-teal-900/25">/</span>
                  <span className="text-xs font-medium text-teal-950">{group.agentName}</span>
                  <span className="text-[11px] text-teal-900/40">
                    · {group.lots.length} lot{group.lots.length > 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {group.lots.length > 1 && (
                    <button
                      type="button"
                      onClick={() => selectAgentLots(group.agentSlug)}
                      className="text-xs text-teal-700 hover:underline"
                    >
                      {allSelected ? 'Deselect all' : `Select all ${group.lots.length}`}
                    </button>
                  )}
                  {selectedLotIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setSelectedLotIds([])}
                      className="text-xs text-teal-900/40 hover:text-teal-700 hover:underline"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              {/* Merged summary strip — shown when 2+ lots selected */}
              {isMerged && (
                <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 rounded-2xl border border-teal-500/30 bg-teal-50/70 px-4 py-3">
                  <p className="text-xs font-semibold text-teal-800">
                    Merged: {uniqueAgentNames.join(' + ')}
                  </p>
                  <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-xs tabular-nums">
                    <span className="text-teal-900/60">
                      Seats <span className="font-semibold text-teal-950">{mergedPurchased}</span>
                      {mergedEffective > mergedPurchased && (
                        <span className="ml-1 text-emerald-600">+{mergedEffective - mergedPurchased} carry</span>
                      )}
                    </span>
                    <span className="text-teal-900/60">
                      Used <span className="font-semibold text-teal-950">{mergedUsed}</span>
                    </span>
                    <span className="text-teal-900/60">
                      Left{' '}
                      <span className={cn('font-semibold', mergedLeft <= 0 ? 'text-rose-600' : 'text-teal-700')}>
                        {mergedLeft}
                      </span>
                    </span>
                    {mergedAmount > 0 && (
                      <span className="text-teal-900/60">
                        Amount <span className="font-semibold text-teal-950">{formatMoney(mergedAmount)} THB</span>
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Lot cards (newest first — lotCards are already sorted that way) */}
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {[...group.lots].reverse().map((lc) => {
                  const isSelected = selectedLotIds.includes(lc.lot.id)
                  const lotDate = lc.lot.paidDate || lc.lot.createdAt.slice(0, 10)

                  return (
                    <button
                      key={lc.lot.id}
                      type="button"
                      onClick={() => {
                        toggleLot(lc.lot.id)
                        setTimeout(() => {
                          document
                            .getElementById(`lot-section-${lc.lot.id}`)
                            ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                        }, 60)
                      }}
                      className={cn(
                        'w-full rounded-[1.35rem] border p-4 text-left transition-all sm:p-5',
                        isSelected
                          ? 'border-teal-500/50 bg-teal-50/80 shadow-sm ring-2 ring-teal-500/25'
                          : 'border-teal-900/10 bg-white hover:border-teal-900/20 hover:shadow-sm',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[11px] text-teal-900/45">
                            Lot {lc.lotIndex} / {lc.totalLots} · {formatShortDate(lotDate)}
                          </p>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span
                            className={cn(
                              'flex size-5 items-center justify-center rounded-full border-2 transition-colors',
                              isSelected
                                ? 'border-teal-600 bg-teal-600 text-white'
                                : 'border-teal-900/20 bg-white',
                            )}
                          >
                            {isSelected && (
                              <svg viewBox="0 0 10 8" fill="none" className="size-2.5">
                                <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </span>
                          {lc.lot.receivesBookings && (
                            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-700">
                              Active
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="mt-3 grid grid-cols-3 gap-x-3 text-xs">
                        <div>
                          <p className="text-teal-900/40">Seats</p>
                          <p className="font-semibold tabular-nums text-teal-950">
                            {lc.lot.seats}
                            {lc.carryIn > 0 && (
                              <span className="ml-1 font-normal text-emerald-600">+{lc.carryIn}</span>
                            )}
                          </p>
                          {lc.carryIn > 0 && <p className="text-[10px] text-emerald-600/70">carry</p>}
                        </div>
                        <div>
                          <p className="text-teal-900/40">Used</p>
                          <p className="font-semibold tabular-nums text-teal-950">{lc.used}</p>
                        </div>
                        <div>
                          <p className="text-teal-900/40">Left</p>
                          <p
                            className={cn(
                              'font-semibold tabular-nums',
                              lc.left < 0
                                ? 'text-rose-600'
                                : lc.carryOut > 0
                                  ? 'text-emerald-600'
                                  : 'text-teal-700',
                            )}
                          >
                            {lc.left}
                          </p>
                          {lc.carryOut > 0 && (
                            <p className="text-[10px] text-emerald-600/70">↗ Lot {lc.lotIndex + 1}</p>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 text-[10px] text-teal-900/35">
                        {lc.startDate ? formatShortDate(lc.startDate) : 'From start'}
                        {' – '}
                        {lc.endDate >= today ? 'today' : formatShortDate(lc.endDate)}
                        {lc.lot.totalAmount > 0 ? ` · ${formatMoney(lc.lot.totalAmount)} THB` : ''}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })()}
      </div>


      
            {loadError ? (
        <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {loadError}
        </p>
      ) : null}

      {loading ? <p className="text-sm text-teal-900/50">Loading…</p> : null}

      {/* ── Stacked per-lot sections (new screen view) ── */}
      {!loading && expandedAgentSlug ? (
        <>
          {/* Narrow filters row */}
          <Surface className="mb-4 p-3 sm:p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[8rem] space-y-1">
                <Label htmlFor="narrow-program" className="text-xs text-neutral-400">Program</Label>
                <select
                  id="narrow-program"
                  value={filterProgram}
                  onChange={(e) => setFilterProgram(e.target.value as Program | '')}
                  className="h-9 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
                >
                  <option value="">All programs</option>
                  <option value="PP">PP</option>
                  <option value="James Bond">James Bond</option>
                </select>
              </div>
              <div className="min-w-[9rem] flex-1 space-y-1 sm:max-w-[13rem]">
                <Label htmlFor="narrow-guest" className="text-xs text-neutral-400">Guest</Label>
                <Input id="narrow-guest" value={filterGuest} onChange={(e) => setFilterGuest(e.target.value)} placeholder="Guest name" className="h-9" />
              </div>
              <div className="min-w-[9rem] flex-1 space-y-1 sm:max-w-[13rem]">
                <Label htmlFor="narrow-vc" className="text-xs text-neutral-400">VC No</Label>
                <Input id="narrow-vc" value={filterVc} onChange={(e) => setFilterVc(e.target.value)} placeholder="Voucher no." className="h-9" />
              </div>
              {hasNarrowFilters && (
                <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={clearNarrowFilters}>Reset</Button>
              )}
            </div>
          </Surface>

          {/* Per-lot stacked sections — newest lot first */}
          <div className="space-y-3">
            {[...lotViews].reverse().map((lv, reversedIndex) => {
              const { lotCard: lc, days } = lv
              const isSelected = selectedLotIds.includes(lc.lot.id)
              const lotDate = lc.lot.paidDate || lc.lot.createdAt.slice(0, 10)
              const isNewest = reversedIndex === 0
              const guestQ = filterGuest.trim().toLowerCase()
              const vcQ = filterVc.trim().toLowerCase()

              // Filter booking rows for display (balance calc uses all bookings regardless)
              const filteredDays = days.map((dv) => ({
                ...dv,
                bookings: dv.bookings.filter((bk) => {
                  if (filterProgram && bk.program !== filterProgram) return false
                  if (guestQ && !bk.leadGuest.toLowerCase().includes(guestQ)) return false
                  if (vcQ && !(bk.agentRef.trim() || '').toLowerCase().includes(vcQ)) return false
                  return true
                }),
              })).filter((dv) => dv.bookings.length > 0)

              const totalBookingHeads = days.reduce((s, dv) => s + dv.dayHeads, 0)

              return (
                <div key={lc.lot.id} id={`lot-section-${lc.lot.id}`}>
                  {/* Carry-over connector between lots (shown below the older lot) */}
                  {!isNewest && lc.carryOut > 0 && (
                    <div className="my-2 flex items-center gap-2 px-2 text-xs text-emerald-600">
                      <div className="h-px flex-1 bg-emerald-200/60" />
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 font-medium">
                        ↗ {lc.carryOut} seats carry to Lot {lc.lotIndex + 1}
                      </span>
                      <div className="h-px flex-1 bg-emerald-200/60" />
                    </div>
                  )}

                  <Surface className={cn('overflow-hidden transition-shadow', isSelected && 'ring-2 ring-teal-500/30')}>
                    {/* ── Lot header ── */}
                    <div className="border-b border-teal-900/8 bg-teal-950/[0.025] px-4 py-3 sm:px-5 sm:py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[11px] font-semibold tracking-wide text-teal-900/45 uppercase">
                              Lot {lc.lotIndex} / {lc.totalLots}
                            </p>
                            {lc.lot.receivesBookings && (
                              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-bold text-teal-700 uppercase tracking-wide">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-base font-bold text-teal-950">
                            +{lc.lot.seats} seats purchased
                          </p>
                          <p className="text-xs text-teal-900/50">
                            {formatShortDate(lotDate)}
                            {lc.lot.totalAmount > 0 && ` · ${formatMoney(lc.lot.totalAmount)} THB`}
                          </p>
                        </div>

                        {/* Lot balance summary */}
                        <div className="flex gap-4 text-right text-xs">
                          <div>
                            <p className="text-teal-900/40">Effective</p>
                            <p className="font-semibold tabular-nums text-teal-950">
                              {lc.effectiveSeats}
                              {lc.carryIn > 0 && (
                                <span className="ml-1 font-normal text-emerald-600 text-[11px]">
                                  (+{lc.carryIn})
                                </span>
                              )}
                            </p>
                          </div>
                          <div>
                            <p className="text-teal-900/40">Used</p>
                            <p className="font-semibold tabular-nums text-teal-950">{lc.used}</p>
                          </div>
                          <div>
                            <p className="text-teal-900/40">Balance</p>
                            <p
                              className={cn(
                                'font-bold tabular-nums text-sm',
                                lc.left < 0 ? 'text-rose-600' : 'text-teal-700',
                              )}
                            >
                              {lc.left}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Credit pills: carry-in + purchase */}
                      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {lc.carryIn > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2.5 py-0.5 font-medium text-teal-700">
                            ↗ +{lc.carryIn} carry from Lot {lc.lotIndex - 1}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 font-medium text-emerald-700">
                          ▲ +{lc.lot.seats} top up
                          {lc.lot.totalAmount > 0 && ` · ${formatMoney(lc.lot.totalAmount)} THB`}
                        </span>
                        <span className="text-teal-900/35">→ starts at {lc.effectiveSeats}</span>
                      </div>
                    </div>

                    {/* ── Booking rows (desktop table) ── */}
                    {filteredDays.length === 0 ? (
                      <p className="px-5 py-4 text-sm text-teal-900/40">
                        {days.length === 0
                          ? "No bookings in this lot's date range."
                          : 'No bookings match the current filter.'}
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b border-teal-900/8 bg-teal-950/[0.02] text-teal-900/45">
                              <th className="px-4 py-2 text-left font-medium">Date</th>
                              <th className="px-2 py-2 text-left font-medium">VC No</th>
                              <th className="px-2 py-2 text-left font-medium">Guest</th>
                              <th className="px-2 py-2 text-left font-medium">Pax</th>
                              <th className="px-2 py-2 text-right font-medium">Heads</th>
                              <th className="px-4 py-2 text-right font-medium">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredDays.map((dv) => (
                              <>
                                {dv.bookings.map((bk) => (
                                  <tr
                                    key={bk.code}
                                    className="border-b border-teal-900/5 hover:bg-teal-950/[0.015]"
                                  >
                                    <td className="px-4 py-1.5 whitespace-nowrap text-teal-900/55">
                                      {formatShortDate(dv.date)}
                                    </td>
                                    <td className="px-2 py-1.5 font-medium tabular-nums break-all max-w-[7rem]">
                                      {bk.agentRef.trim() || '—'}
                                    </td>
                                    <td className="px-2 py-1.5 max-w-[9rem] truncate" title={bk.leadGuest}>
                                      {bk.leadGuest}
                                    </td>
                                    <td className="px-2 py-1.5 tabular-nums text-teal-900/70">
                                      {formatPaxBreakdown(bk)}
                                    </td>
                                    <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-teal-950">
                                      {chargeablePax(bk)}
                                    </td>
                                    <td className="px-4 py-1.5 text-right tabular-nums text-teal-900/30">
                                      —
                                    </td>
                                  </tr>
                                ))}
                                {/* Day total row */}
                                <tr className="border-b-2 border-teal-900/10 bg-teal-950/[0.03]">
                                  <td
                                    colSpan={4}
                                    className="px-4 py-1.5 text-[11px] font-semibold text-teal-900/50"
                                  >
                                    {formatShortDate(dv.date)}
                                    <span className="ml-1.5 font-normal text-teal-900/30">
                                      · day total
                                    </span>
                                  </td>
                                  <td className="px-2 py-1.5 text-right text-[11px] font-bold tabular-nums text-teal-950">
                                    {dv.dayHeads}
                                  </td>
                                  <td
                                    className={cn(
                                      'px-4 py-1.5 text-right text-[11px] font-bold tabular-nums',
                                      dv.balanceAfterDay < 0 ? 'text-rose-600' : 'text-teal-700',
                                    )}
                                  >
                                    {dv.balanceAfterDay}
                                  </td>
                                </tr>
                              </>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* ── Lot footer ── */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-teal-900/8 bg-teal-950/[0.015] px-4 py-2.5 sm:px-5">
                      <p className="text-[11px] text-teal-900/45">
                        {lc.startDate ? formatShortDate(lc.startDate) : 'From start'}
                        {' – '}
                        {lc.endDate >= today ? 'today' : formatShortDate(lc.endDate)}
                        <span className="mx-1.5 text-teal-900/25">·</span>
                        {totalBookingHeads} heads used
                      </p>
                      {lc.carryOut > 0 ? (
                        <p className="text-[11px] font-medium text-emerald-600">
                          ↗ {lc.carryOut} seats carry to Lot {lc.lotIndex + 1}
                        </p>
                      ) : lc.left < 0 ? (
                        <p className="text-[11px] font-medium text-rose-600">
                          Overdrawn by {Math.abs(lc.left)} seats
                        </p>
                      ) : (
                        <p className="text-[11px] text-teal-700">{lc.left} seats remaining</p>
                      )}
                    </div>
                  </Surface>
                </div>
              )
            })}
          </div>

          {lotViews.length === 0 && !loading && (
            <Surface className="p-6 text-sm text-teal-900/55">
              No allotment lots found for this agent.
            </Surface>
          )}
        </>
      ) : !loading && !expandedAgentSlug ? null : null}

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
                {lines.filter((line) => !line.isTopUp && !(line.vcNo === '—' && line.guestName === '—')).length}{' '}
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
                  Heads
                </th>
                <th className="border border-teal-900/15 px-1.5 py-1.5 text-right font-bold uppercase">
                  Balance
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.flatMap((line) => {
                // ── Print top-up row ──
                if (line.isTopUp) {
                  return [
                    <tr key={`print-${line.key}`} className="bg-emerald-50">
                      <td className="border border-emerald-200 px-1.5 py-1 whitespace-nowrap text-[9px] text-emerald-800">
                        {formatShortDate(line.date)}
                      </td>
                      <td
                        colSpan={3}
                        className="border border-emerald-200 px-1.5 py-1 text-[9px] font-bold text-emerald-800"
                      >
                        ▲ TOP UP — {line.topUpLabel}
                        {line.topUpAmount ? ` · ${formatMoney(line.topUpAmount)} THB` : ''}
                        {' · '}{line.agentName}
                      </td>
                      <td className="border border-emerald-200 px-1.5 py-1 text-right text-[9px] font-bold tabular-nums text-emerald-800">
                        +{line.topUpSeats}
                      </td>
                      <td
                        className={cn(
                          'border border-emerald-200 px-1.5 py-1 text-right text-[9px] font-bold tabular-nums',
                          line.balance !== null && line.balance <= 0
                            ? 'text-rose-700'
                            : 'text-emerald-700',
                        )}
                      >
                        {line.balance === null ? '—' : line.balance}
                      </td>
                    </tr>,
                  ]
                }

                const isRealBooking = !(line.vcNo === '—' && line.guestName === '—')

                const bookingTr = (
                  <tr key={`print-${line.key}`}>
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
                    <td className="border border-teal-900/10 px-1.5 py-1 text-right tabular-nums font-semibold text-teal-950">
                      {line.totalHeadUse === null ? '' : line.totalHeadUse}
                    </td>
                    <td className="border border-teal-900/10 px-1.5 py-1" />
                  </tr>
                )

                if (!line.isDayEnd) return [bookingTr]

                const summaryTr = (
                  <tr
                    key={`print-${line.key}-day-total`}
                    className="border-b-2 border-b-teal-900/25 bg-teal-950/[0.04]"
                  >
                    <td
                      colSpan={4}
                      className="border border-teal-900/12 px-1.5 py-1 text-[9px] font-bold text-teal-900/60"
                    >
                      {formatShortDate(line.date)}
                      {isRealBooking ? ' · day total' : ` · ${line.bookingLabel}`}
                    </td>
                    <td className="border border-teal-900/12 px-1.5 py-1 text-right text-[9px] font-bold tabular-nums text-teal-950">
                      {line.dayTotalHeads === null ? '—' : line.dayTotalHeads}
                    </td>
                    <td
                      className={cn(
                        'border border-teal-900/12 px-1.5 py-1 text-right text-[9px] font-bold tabular-nums',
                        line.balance !== null && line.balance <= 0 ? 'text-rose-700' : 'text-teal-900',
                      )}
                    >
                      {line.balance === null ? '—' : line.balance}
                    </td>
                  </tr>
                )

                if (!isRealBooking) return [summaryTr]
                return [bookingTr, summaryTr]
              })}
              <tr className="bg-teal-50 font-semibold">
                <td className="border border-teal-900/15 px-1.5 py-1.5" colSpan={3}>
                  Booking total
                </td>
                <td className="border border-teal-900/15 px-1.5 py-1.5 tabular-nums">
                  {bookingTotals.adults}+{bookingTotals.children}
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
          Balance auto-syncs from booking head counts up to today. Save as PDF from the print dialog.
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
