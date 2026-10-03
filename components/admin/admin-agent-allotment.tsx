'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  ArrowLeft,
  CalendarCheck2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  History,
  Pencil,
  Plus,
  Trash2,
  Wallet,
} from 'lucide-react'
import { AdminAgentAllotmentDailyChecker } from '@/components/admin/admin-agent-allotment-daily'
import { AdminAgentAllotmentHistory } from '@/components/admin/admin-agent-allotment-history'
import { usePortal } from '@/components/portal-provider'
import { usePortalTodayISO } from '@/lib/use-portal-today'
import { PageHeader, Surface } from '@/components/ui-primitives'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import {
  allocateDailyHeadsFifo,
  lotUsageMap,
  type LotUsageSummary,
} from '@/lib/allotment-lot-fifo'
import { formatShortDate, todayISO, uniqueAgentSlug } from '@/lib/format'
import {
  addAgentAllotmentPayment,
  allotmentBalance,
  allotmentPaidTotal,
  allotmentPayments,
  allotmentPayStatus,
  allotmentTotalAmount,
  createAgentAllotment,
  deleteAgentAllotment,
  formatAllotmentParkFee,
  listAgentAllotments,
  removeLastAgentAllotmentPayment,
  setAgentAllotmentReceiving,
  topUpAgentAllotment,
  updateAgentAllotment,
  type AgentAllotment,
  type AgentAllotmentParkFee,
  type AgentAllotmentPayStatus,
} from '@/lib/supabase/agent-allotment-db'
import {
  fetchAgentBookingDayPax,
  listAgentAllotmentDaily,
  moveAgentAllotmentDaily,
  type AgentAllotmentDaily,
  type AgentBookingDayPax,
} from '@/lib/supabase/agent-allotment-daily-db'
import { cn } from '@/lib/utils'

type View = 'hub' | 'add' | 'history' | 'daily' | 'agent' | 'lot'

type Draft = {
  agentSlug: string
  newAgentName: string
  adultPrice: string
  childPrice: string
  parkFee: AgentAllotmentParkFee
  /** Shared AD+CH head pool for this lot. */
  heads: string
  paidAmount: string
  paidDate: string
  note: string
}

type PaymentDraft = {
  amount: string
  paidDate: string
  note: string
}

const emptyPaymentDraft = (): PaymentDraft => ({
  amount: '',
  paidDate: todayISO(),
  note: '',
})

const NEW_AGENT_VALUE = '__new__'

const emptyDraft = (): Draft => ({
  agentSlug: '',
  newAgentName: '',
  adultPrice: '',
  childPrice: '',
  parkFee: 'exc',
  heads: '',
  paidAmount: '',
  paidDate: todayISO(),
  note: '',
})

const selectClassName =
  'h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15'

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
}

function parseMoney(value: string) {
  const n = Number(String(value).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : NaN
}

function parseHeads(value: string) {
  const n = Math.floor(Number(String(value).trim()))
  return Number.isFinite(n) ? n : NaN
}

/** Purchase amount for a shared head pool — priced at AD rate; CH bookings deduct from same pool. */
function draftTotals(draft: Draft) {
  const adultPrice = parseMoney(draft.adultPrice)
  const childPrice = parseMoney(draft.childPrice)
  const heads = parseHeads(draft.heads)
  const safeAdultPrice = Number.isFinite(adultPrice) && adultPrice >= 0 ? adultPrice : 0
  const safeChildPrice = Number.isFinite(childPrice) && childPrice >= 0 ? childPrice : 0
  const safeHeads = Number.isFinite(heads) && heads >= 0 ? heads : 0
  return {
    adultPrice: safeAdultPrice,
    childPrice: safeChildPrice,
    seats: safeHeads,
    totalAmount: allotmentTotalAmount({
      adultPrice: safeAdultPrice,
      childPrice: safeChildPrice,
      adultSeats: safeHeads,
      childSeats: 0,
    }),
  }
}

function seatsToDraftHeads(row: Pick<AgentAllotment, 'seats' | 'adultSeats' | 'childSeats'>) {
  return String(Math.max(row.seats, row.adultSeats + row.childSeats))
}

function formatMoney(value: number) {
  return value.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

function lotTransfers(lot: AgentAllotment) {
  const payments = allotmentPayments(lot)
  const date = (lot.paidDate || lot.createdAt).slice(0, 10)
  const paid = allotmentPaidTotal(lot)
  const lump = {
    id: lot.id,
    date,
    heads: lot.seats,
    amount: paid > 0 ? paid : lot.totalAmount,
    note: payments
      .map((payment) => payment.note.replace(/^Ref\s*/i, '').trim())
      .filter(Boolean)
      .join(', '),
  }
  if (payments.length === 0) return [lump]
  const known = payments.reduce((sum, payment) => sum + (payment.heads ?? 0), 0)
  if (known <= 0) return [lump]
  const missing = payments.filter((payment) => !(payment.heads && payment.heads > 0))
  const shares = new Map<string, number>()
  let leftover = Math.max(0, lot.seats - known)
  if (missing.length > 0 && leftover > 0) {
    const base = Math.floor(leftover / missing.length)
    let extra = leftover - base * missing.length
    for (const payment of missing) {
      const heads = base + (extra > 0 ? 1 : 0)
      if (extra > 0) extra -= 1
      shares.set(payment.id, heads)
    }
  }
  return payments.map((payment) => {
    const noted = payment.note.replace(/^Ref\s*/i, '').trim()
    return {
      id: payment.id,
      date: (payment.headsDate || payment.paidDate).slice(0, 10),
      heads: payment.heads && payment.heads > 0 ? payment.heads : (shares.get(payment.id) ?? 0),
      amount: payment.amount,
      note: noted,
    }
  })
}

type DepositBookLine = {
  key: string
  date: string
  kind: 'in' | 'out'
  title: string
  headsDelta: number
  baht: number | null
  headsLeft: number
}

/** One running head balance, oldest first — the sheet's TK column. */
function buildDepositBook(lots: AgentAllotment[], daily: AgentAllotmentDaily[]): DepositBookLine[] {
  const orderedLots = [...lots].sort((a, b) => {
    const aDate = (a.paidDate || a.createdAt).slice(0, 10)
    const bDate = (b.paidDate || b.createdAt).slice(0, 10)
    return aDate.localeCompare(bDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  })

  const rateOn = (day: string) => {
    const open = orderedLots.filter((lot) => (lot.paidDate || lot.createdAt).slice(0, 10) <= day)
    return open.at(-1)?.adultPrice ?? 0
  }

  const events: Array<Omit<DepositBookLine, 'headsLeft'> & { sort: string }> = []

  for (const lot of orderedLots) {
    for (const [index, transfer] of lotTransfers(lot).entries()) {
      events.push({
        key: `in-${lot.id}-${transfer.id}`,
        date: transfer.date,
        sort: `0-${String(index).padStart(3, '0')}`,
        kind: 'in',
        title: topupTitle(transfer.amount, transfer.heads, lot.adultPrice, transfer.note),
        headsDelta: transfer.heads,
        baht: transfer.amount,
      })
    }
  }

  for (const row of daily) {
    if (row.totalDeduct <= 0) continue
    const note = row.note.replace(/^BW ledger:\s*/i, '').trim()
    const extra = note && !/^bw ledger$/i.test(note) ? note : ''
    const rate = rateOn(row.day)
    events.push({
      key: `out-${row.id}`,
      date: row.day,
      sort: `1-${row.day}`,
      kind: 'out',
      title: extra,
      headsDelta: -row.totalDeduct,
      baht: rate > 0 ? -(row.totalDeduct * rate) : null,
      })
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.sort.localeCompare(b.sort))

  let heads = 0
  return events.map((event) => {
    heads += event.headsDelta
    return {
      key: event.key,
      date: event.date,
      kind: event.kind,
      title: event.title,
      headsDelta: event.headsDelta,
      baht: event.baht,
      headsLeft: heads,
    }
  })
}

type LotBookStatus = 'done' | 'active' | 'waiting' | 'over'

type LotBook = {
  lotId: string
  index: number
  openDate: string
  seats: number
  rate: number
  paid: number
  ref: string
  used: number
  remaining: number
  status: LotBookStatus
  lines: DepositBookLine[]
}

function lotBookStatusLabel(status: LotBookStatus) {
  if (status === 'done') return 'หมด'
  if (status === 'active') return 'ใช้อยู่'
  if (status === 'over') return 'เกิน'
  return 'รอ'
}

function formatLotTabDate(isoDate: string) {
  return new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  })
}

function usageNote(day: string, dailyByDay: Map<string, AgentAllotmentDaily>) {
  const saved = dailyByDay.get(day)
  if (!saved) return 'จากบุ๊กกิ้งในระบบ'
  const note = saved.note.replace(/^BW ledger:\s*/i, '').trim()
  if (!note || /^bw ledger$/i.test(note)) return ''
  return note
}

function topupTitle(amount: number, heads: number, rate: number, note: string) {
  return [`Topup ${formatMoney(amount)}`, `${heads} หัว @ ${formatMoney(rate)}`, note].filter(Boolean).join(' · ')
}

function usageTitle(note: string, taken: number, dayTotal: number) {
  const split = dayTotal > taken ? `วันนี้ทั้งวัน ${dayTotal} หัว ล็อตนี้รับ ${taken}` : ''
  return [split, note].filter(Boolean).join(' · ')
}

/** One tab per lot. Heads in a tab only move that lot; the next lot starts when this one is full. */
function buildLotBooks(
  lots: AgentAllotment[],
  fifo: ReturnType<typeof allocateDailyHeadsFifo>,
  daily: AgentAllotmentDaily[],
  dayTotals: { day: string; totalDeduct: number }[],
  activeLotId: string,
): LotBook[] {
  const dailyByDay = new Map(daily.map((row) => [row.day, row]))
  const totalByDay = new Map(dayTotals.map((row) => [row.day, row.totalDeduct]))
  const summaryById = new Map(fifo.summaries.map((row) => [row.allotmentId, row]))

  return lots.map((lot, index) => {
    const summary = summaryById.get(lot.id) ?? {
      allotmentId: lot.id,
      purchased: lot.seats,
      used: 0,
      remaining: lot.seats,
    }
    const transfers = lotTransfers(lot)
    const openDate = transfers[0]?.date || (lot.paidDate || lot.createdAt).slice(0, 10)
    const paid = allotmentPaidTotal(lot)
    const money = paid > 0 ? paid : lot.totalAmount
    const ref = transfers
      .map((transfer) => transfer.note)
      .filter(Boolean)
      .slice(0, 3)
      .join(', ')
    const events: Array<Omit<DepositBookLine, 'headsLeft'> & { sort: string }> = []
    for (const [transferIndex, transfer] of transfers.entries()) {
      events.push({
        key: `in-${lot.id}-${transfer.id}`,
        date: transfer.date,
        sort: `0-${String(transferIndex).padStart(3, '0')}`,
        kind: 'in',
        title: topupTitle(transfer.amount, transfer.heads, lot.adultPrice, transfer.note),
        headsDelta: transfer.heads,
        baht: transfer.amount,
      })
    }
    for (const item of fifo.byLotId.get(lot.id) ?? []) {
      const dayTotal = totalByDay.get(item.day) ?? item.heads
      events.push({
        key: `use-${lot.id}-${item.day}`,
        date: item.day,
        sort: `1-${item.day}`,
        kind: 'out',
        title: usageTitle(usageNote(item.day, dailyByDay), item.heads, dayTotal),
        headsDelta: -item.heads,
        baht: lot.adultPrice > 0 ? -(item.heads * lot.adultPrice) : null,
      })
    }
    events.sort((a, b) => a.date.localeCompare(b.date) || a.sort.localeCompare(b.sort))
    let left = 0
    const lines = events.map((event) => {
      left += event.headsDelta
      return {
        key: event.key,
        date: event.date,
        kind: event.kind,
        title: event.title,
        headsDelta: event.headsDelta,
        baht: event.baht,
        headsLeft: left,
      }
    })
    let status: LotBookStatus = 'waiting'
    if (summary.remaining < 0) status = 'over'
    else if (summary.used > 0 && summary.remaining === 0) status = 'done'
    else if (lot.id === activeLotId || summary.used > 0) status = 'active'
    return {
      lotId: lot.id,
      index: index + 1,
      openDate,
      seats: lot.seats,
      rate: lot.adultPrice,
      paid: money,
      ref,
      used: summary.used,
      remaining: summary.remaining,
      status,
      lines,
    }
  })
}

function sortBookLines(rows: DepositBookLine[], newestFirst: boolean) {
  return rows
    .map((line, index) => ({ line, index }))
    .sort((a, b) => {
      const order = a.line.date.localeCompare(b.line.date) || a.index - b.index
      return newestFirst ? -order : order
    })
    .map((row) => row.line)
}

function DepositBookRow({
  line,
  moveTargets,
  onMoveDay,
}: {
  line: DepositBookLine
  moveTargets?: { id: string; label: string }[]
  onMoveDay?: (day: string, allotmentId: string) => void
}) {
  return (
    <TableRow className={line.kind === 'in' ? 'bg-amber-50 hover:bg-amber-50/80' : undefined}>
      <TableCell className="px-4 whitespace-nowrap text-teal-950">
        {formatShortDate(line.date)}
      </TableCell>
      <TableCell className="max-w-[420px] whitespace-normal text-teal-950">
        {line.title}
        {line.kind === 'out' && moveTargets && moveTargets.length > 0 && onMoveDay ? (
          <select
            aria-label={`Move ${line.date}`}
            className="ml-2 h-7 rounded-lg border border-teal-900/15 bg-white px-1.5 text-[11px] text-teal-900"
            defaultValue=""
            onChange={(event) => {
              const allotmentId = event.target.value
              event.target.value = ''
              if (allotmentId) onMoveDay(line.date, allotmentId)
            }}
          >
            <option value="">Move</option>
            {moveTargets.map((target) => (
              <option key={target.id} value={target.id}>
                {target.label}
              </option>
            ))}
          </select>
        ) : null}
      </TableCell>
      <TableCell
        className={cn(
          'text-right font-medium tabular-nums',
          line.headsDelta > 0 ? 'text-emerald-800' : 'text-teal-950',
        )}
      >
        {line.headsDelta > 0 ? `+${line.headsDelta}` : line.headsDelta}
      </TableCell>
      <TableCell
        className={cn(
          'text-right tabular-nums',
          line.baht != null && line.baht > 0 ? 'text-emerald-800' : 'text-teal-900/70',
        )}
      >
        {line.baht == null ? '—' : `${line.baht > 0 ? '+' : ''}${formatMoney(line.baht)}`}
      </TableCell>
      <TableCell
        className={cn(
          'px-4 text-right font-semibold tabular-nums',
          line.headsLeft < 0 ? 'text-rose-700' : 'text-teal-950',
        )}
      >
        {line.headsLeft}
      </TableCell>
    </TableRow>
  )
}

function DepositBookTable({
  lines,
  moveTargets,
  onMoveDay,
}: {
  lines: DepositBookLine[]
  moveTargets?: { id: string; label: string }[]
  onMoveDay?: (day: string, allotmentId: string) => void
}) {
  const [showAll, setShowAll] = useState(false)
  const [topupNewestFirst, setTopupNewestFirst] = useState(false)
  const [usageNewestFirst, setUsageNewestFirst] = useState(false)
  const lineKey = lines.map((line) => line.key).join('|')
  const [seenKey, setSeenKey] = useState(lineKey)
  if (seenKey !== lineKey) {
    setSeenKey(lineKey)
    setShowAll(false)
  }
  const open = seenKey === lineKey && showAll
  if (lines.length === 0) {
    return <p className="px-4 py-6 text-sm text-teal-900/55">ยังไม่มีรายการ</p>
  }
  const topups = lines.filter((line) => line.kind === 'in')
  const usage = sortBookLines(
    lines.filter((line) => line.kind === 'out'),
    usageNewestFirst,
  )
  const latestTopup = topups.at(-1) ?? null
  const latestHeadsLeft = lines[lines.length - 1]?.headsLeft ?? 0
  const shownTopups = open
    ? sortBookLines(topups, topupNewestFirst)
    : latestTopup
      ? [{ ...latestTopup, headsLeft: latestHeadsLeft }]
      : []
  return (
    <div>
      {topups.length > 1 ? (
        <div className="flex items-center justify-between gap-3 border-b border-amber-200/80 bg-amber-50 px-4 py-2">
          <p className="text-xs text-amber-950">
            {open
              ? `Topup ${topups.length}`
              : `Topup ล่าสุด · ยอดรวมล่าสุด ${latestHeadsLeft}`}
          </p>
          <button
            type="button"
            className="text-xs font-semibold text-amber-950 underline decoration-amber-950/30 underline-offset-2"
            onClick={() => setShowAll((current) => !current)}
          >
            {open ? 'ซ่อน' : 'โชว์'}
          </button>
        </div>
      ) : null}
      <Table containerClassName="max-h-[min(70vh,720px)] overflow-auto">
      <TableHeader className="sticky top-0 z-10 bg-white">
        <TableRow className="hover:bg-transparent">
          <TableHead className="px-4 text-teal-700/45" aria-sort={topupNewestFirst ? 'descending' : 'ascending'}>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-teal-800"
              onClick={() => {
                const next = !topupNewestFirst
                setTopupNewestFirst(next)
                setUsageNewestFirst(next)
              }}
            >
              วันที่
              {topupNewestFirst ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
            </button>
          </TableHead>
          <TableHead className="text-teal-700/45">รายการ</TableHead>
          <TableHead className="text-right text-teal-700/45">หัว</TableHead>
          <TableHead className="text-right text-teal-700/45">บาท</TableHead>
          <TableHead className="px-4 text-right text-teal-700/45">หัวเหลือ</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {shownTopups.map((line) => (
          <DepositBookRow
            key={line.key}
            line={line}
            moveTargets={moveTargets}
            onMoveDay={onMoveDay}
          />
        ))}
        {usage.length > 0 ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={5} className="bg-teal-950/[0.03] px-4 py-1.5">
              <button
                type="button"
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-900/70"
                onClick={() => setUsageNewestFirst((current) => !current)}
              >
                การใช้หัว
                {usageNewestFirst ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
              </button>
            </TableCell>
          </TableRow>
        ) : null}
        {usage.map((line) => (
          <DepositBookRow
            key={line.key}
            line={line}
            moveTargets={moveTargets}
            onMoveDay={onMoveDay}
          />
        ))}
      </TableBody>
    </Table>
    </div>
  )
}

function payStatusLabel(status: AgentAllotmentPayStatus) {
  if (status === 'paid') return 'Paid'
  if (status === 'partial') return 'Partial'
  return 'Unpaid'
}

function payStatusClass(status: AgentAllotmentPayStatus) {
  if (status === 'paid') return 'bg-emerald-50 text-emerald-800 ring-emerald-700/15'
  if (status === 'partial') return 'bg-amber-50 text-amber-900 ring-amber-700/15'
  return 'bg-rose-50 text-rose-800 ring-rose-700/15'
}

/** Split FIFO-allocated heads into AD/CH using that day's booking mix (proportional). */
function splitAllocatedPax(allocated: number, dayAdults: number, dayChildren: number) {
  const heads = Math.max(0, Math.floor(allocated))
  if (heads <= 0) return { adults: 0, children: 0 }
  const dayTotal = Math.max(0, dayAdults) + Math.max(0, dayChildren)
  if (dayTotal <= 0) {
    // Daily checker only — price as AD (same as lot head pool).
    return { adults: heads, children: 0 }
  }
  let adults = Math.round((Math.max(0, dayAdults) * heads) / dayTotal)
  adults = Math.min(heads, Math.max(0, adults))
  return { adults, children: heads - adults }
}

/** e.g. 5A+2C breakdown + total heads */
function dailyUseHeadParts(adults: number, children: number, heads: number) {
  return {
    detail: `${Math.max(0, adults)}A+${Math.max(0, children)}C`,
    total: Math.max(0, heads),
  }
}

function DailyUseHeadCell({
  adults,
  children,
  heads,
}: {
  adults: number
  children: number
  heads: number
}) {
  const { detail, total } = dailyUseHeadParts(adults, children, heads)
  return (
    <div className="inline-flex items-baseline justify-end gap-1.5 tabular-nums">
      <span className="text-[10px] font-normal text-teal-900/40">{detail}</span>
      <span className="text-sm font-bold text-teal-950">{total}</span>
    </div>
  )
}

/** Clear per-lot money + heads snapshot for transfer / usage cards. */
/** Header badge: Due (red) or Over paid (green). */
function LotCardCashBadge({ paid, lotTotal }: { paid: number; lotTotal: number }) {
  const due = Math.round(Math.max(0, lotTotal - paid) * 100) / 100
  const overPaid = Math.round(Math.max(0, paid - lotTotal) * 100) / 100
  if (due > 0.009) {
    return (
      <div className="shrink-0 text-right">
        <p className="text-[10px] font-semibold tracking-wide text-rose-600/80 uppercase">Due</p>
        <p className="text-base font-bold tabular-nums text-rose-600">
          {formatMoney(due)}
          <span className="ml-0.5 text-xs font-semibold">THB</span>
        </p>
      </div>
    )
  }
  if (overPaid > 0.009) {
    return (
      <div className="shrink-0 text-right">
        <p className="text-[10px] font-semibold tracking-wide text-emerald-700/80 uppercase">
          Over paid
        </p>
        <p className="text-base font-bold tabular-nums text-emerald-700">
          {formatMoney(overPaid)}
          <span className="ml-0.5 text-xs font-semibold">THB</span>
        </p>
      </div>
    )
  }
  return null
}

function LotCardStats({
  paid,
  lotHeads,
  lotTotal,
  usedAmount,
  usedHeads,
  usedAdults,
  usedChildren,
  headsLeft,
  isActive = false,
}: {
  paid: number
  lotHeads: number
  lotTotal: number
  usedAmount: number
  usedHeads: number
  usedAdults: number
  usedChildren: number
  headsLeft: number
  /** Orange highlight — lot still has remaining money/heads (in use). */
  isActive?: boolean
}) {
  const moneyLeft = Math.round((paid - usedAmount) * 100) / 100
  const paxDetail = dailyUseHeadParts(usedAdults, usedChildren, usedHeads).detail
  const moneyLeftClass =
    moneyLeft < 0
      ? 'text-rose-700'
      : isActive || moneyLeft > 0
        ? 'text-orange-600'
        : 'text-teal-800'
  const headsLeftClass =
    headsLeft < 0
      ? 'text-rose-700'
      : isActive || headsLeft > 0
        ? 'text-orange-600'
        : 'text-teal-800'

  return (
    <div className="space-y-1">
      <div
        className={cn(
          'grid grid-cols-3 gap-x-2 gap-y-0.5 rounded-lg px-2.5 py-1.5',
          isActive ? 'bg-orange-50/90 ring-1 ring-orange-500/25' : 'bg-teal-950/[0.03]',
        )}
      >
        <div className="min-w-0">
          <p className="text-[9px] font-medium tracking-wide text-teal-900/40 uppercase">
            Topped up
          </p>
          <p className="text-[13px] font-bold leading-tight tabular-nums text-teal-800">
            {formatMoney(paid)}
            <span className="ml-0.5 text-[10px] font-semibold text-teal-900/45">THB</span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-medium tracking-wide text-teal-900/40 uppercase">
            Lot heads
          </p>
          <p className="text-[13px] font-bold leading-tight tabular-nums text-teal-950">
            {lotHeads}
            <span className="ml-1 text-[9px] font-normal text-teal-900/40">
              / {formatMoney(lotTotal)}
            </span>
          </p>
        </div>
        <div className="min-w-0">
          <p
            className={cn(
              'text-[9px] font-medium tracking-wide uppercase',
              isActive || moneyLeft > 0 ? 'text-orange-700/70' : 'text-teal-900/40',
            )}
          >
            Money left
          </p>
          <p className={cn('text-[13px] font-bold leading-tight tabular-nums', moneyLeftClass)}>
            {formatMoney(moneyLeft)}
            <span className="ml-0.5 text-[10px] font-semibold opacity-70">THB</span>
          </p>
        </div>
      </div>

      <div
        className={cn(
          'grid grid-cols-3 gap-x-2 gap-y-0.5 rounded-lg px-2.5 py-1.5 ring-1',
          isActive ? 'bg-orange-50/50 ring-orange-500/20' : 'bg-white/70 ring-teal-900/8',
        )}
      >
        <div className="min-w-0">
          <p className="text-[9px] font-medium tracking-wide text-teal-900/40 uppercase">
            Used money
          </p>
          <p className="text-[13px] font-bold leading-tight tabular-nums text-teal-950">
            {formatMoney(usedAmount)}
            <span className="ml-0.5 text-[10px] font-semibold text-teal-900/45">THB</span>
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[9px] font-medium tracking-wide text-teal-900/40 uppercase">
            Used heads
          </p>
          <p className="inline-flex items-baseline gap-1 text-[13px] font-bold leading-tight tabular-nums text-teal-950">
            {usedHeads}
            <span className="text-[9px] font-normal text-teal-900/40">{paxDetail}</span>
          </p>
        </div>
        <div className="min-w-0">
          <p
            className={cn(
              'text-[9px] font-medium tracking-wide uppercase',
              isActive || headsLeft > 0 ? 'text-orange-700/70' : 'text-teal-900/40',
            )}
          >
            Heads left
          </p>
          <p className={cn('text-[13px] font-bold leading-tight tabular-nums', headsLeftClass)}>
            {headsLeft}
          </p>
        </div>
      </div>
    </div>
  )
}

export function AdminAgentAllotment() {
  const { agents, addAgent } = usePortal()
  const today = usePortalTodayISO()
  const [view, setView] = useState<View>('hub')
  const [showLots, setShowLots] = useState(false)
  /** 'book' = running wallet, 'active' = lot in use, otherwise a lot id. */
  const [bookTab, setBookTab] = useState<'book' | 'active' | string>('active')
  const lotTabStripRef = useRef<HTMLDivElement>(null)
  const [selectedAgentSlug, setSelectedAgentSlug] = useState('')
  const [selectedLotId, setSelectedLotId] = useState('')
  const [rows, setRows] = useState<AgentAllotment[]>([])
  const [dailyRows, setDailyRows] = useState<AgentAllotmentDaily[]>([])
  const [bookingDayPax, setBookingDayPax] = useState<AgentBookingDayPax[]>([])
  const [advanceExpanded, setAdvanceExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [addError, setAddError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<AgentAllotment | null>(null)
  const [editDraft, setEditDraft] = useState<Draft>(emptyDraft)
  const [editError, setEditError] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [ledgerDraft, setLedgerDraft] = useState<Draft>(emptyDraft)
  const [ledgerError, setLedgerError] = useState('')
  const [savingLedger, setSavingLedger] = useState(false)
  const [topUpDraft, setTopUpDraft] = useState(() => ({
    paidDate: todayISO(),
    heads: '',
    amount: '',
    note: '',
  }))
  const [topUpError, setTopUpError] = useState('')
  const [savingTopUp, setSavingTopUp] = useState(false)
  const [paymentDraftByLot, setPaymentDraftByLot] = useState<Record<string, PaymentDraft>>({})
  const [paymentErrorByLot, setPaymentErrorByLot] = useState<Record<string, string>>({})
  const [savingPaymentLotId, setSavingPaymentLotId] = useState<string | null>(null)

  const agentOptions = useMemo(
    () => [...agents].sort((a, b) => a.name.localeCompare(b.name)),
    [agents],
  )

  const deductedByAgent = useMemo(() => {
    const map = new Map<string, number>()
    for (const row of dailyRows) {
      map.set(row.agentSlug, (map.get(row.agentSlug) ?? 0) + row.totalDeduct)
    }
    return map
  }, [dailyRows])

  const agentSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        slug: string
        name: string
        purchases: number
        seats: number
        used: number
        remaining: number
        totalAmount: number
        paidAmount: number
        balance: number
        adultPrice: number
        childPrice: number
      }
    >()
    for (const row of rows) {
      const current = map.get(row.agentSlug) ?? {
        slug: row.agentSlug,
        name: row.agentName,
        purchases: 0,
        seats: 0,
        used: 0,
        remaining: 0,
        totalAmount: 0,
        paidAmount: 0,
        balance: 0,
        adultPrice: 0,
        childPrice: 0,
      }
      current.name = row.agentName
      current.purchases += 1
      current.seats += row.seats
      current.totalAmount += row.totalAmount
      current.paidAmount += allotmentPaidTotal(row)
      current.balance += allotmentBalance(row)
      if (row.adultPrice > 0) current.adultPrice = row.adultPrice
      if (row.childPrice > 0) current.childPrice = row.childPrice
      map.set(row.agentSlug, current)
    }
    for (const summary of map.values()) {
      summary.used = deductedByAgent.get(summary.slug) ?? 0
      summary.remaining = summary.seats - summary.used
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [rows, deductedByAgent])

  const selectedAgentRows = useMemo(
    () =>
      rows
        .filter((row) => row.agentSlug === selectedAgentSlug)
        .sort((a, b) => {
          const aOpen = (a.paidDate || a.createdAt).slice(0, 10)
          const bOpen = (b.paidDate || b.createdAt).slice(0, 10)
          return (
            aOpen.localeCompare(bOpen) ||
            a.createdAt.localeCompare(b.createdAt) ||
            a.id.localeCompare(b.id)
          )
        }),
    [rows, selectedAgentSlug],
  )

  const selectedAgentDaily = useMemo(
    () => dailyRows.filter((row) => row.agentSlug === selectedAgentSlug),
    [dailyRows, selectedAgentSlug],
  )

  const earliestLotOpen = useMemo(
    () =>
      selectedAgentRows
        .map((row) => (row.paidDate || row.createdAt).slice(0, 10))
        .sort((a, b) => a.localeCompare(b))[0] ?? '',
    [selectedAgentRows],
  )

  /**
   * Saved days that are not pinned to a lot (the imported sheet) still spread
   * across lots. Live bookings stay in Daily checker until Save.
   */
  const selectedAgentDailyForFifo = useMemo(
    () =>
      selectedAgentDaily
        .filter((row) => !row.allotmentId)
        .filter((row) => !earliestLotOpen || row.day >= earliestLotOpen)
        .filter((row) => row.day <= today)
        .map((row) => ({ day: row.day, totalDeduct: row.totalDeduct }))
        .sort((a, b) => a.day.localeCompare(b.day)),
    [selectedAgentDaily, earliestLotOpen, today],
  )

  /** Future tour dates — preview only, not deducted from allotment yet. */
  const advanceBookingPreview = useMemo(() => {
    const days = bookingDayPax
      .filter((row) => {
        if (row.totalDeduct <= 0) return false
        if (earliestLotOpen && row.day < earliestLotOpen) return false
        return row.day > today
      })
      .map((row) => ({
        day: row.day,
        adults: row.adults,
        children: row.children,
        heads: row.totalDeduct,
      }))
      .sort((a, b) => a.day.localeCompare(b.day))

    return {
      days,
      heads: days.reduce((sum, row) => sum + row.heads, 0),
      adults: days.reduce((sum, row) => sum + row.adults, 0),
      children: days.reduce((sum, row) => sum + row.children, 0),
    }
  }, [bookingDayPax, earliestLotOpen, today])

  const selectedAgentFifo = useMemo(() => {
    const fifo = allocateDailyHeadsFifo(
      selectedAgentRows.map((row) => ({
        id: row.id,
        seats: row.seats,
        openedAt: row.paidDate || row.createdAt.slice(0, 10),
        createdAt: row.createdAt,
        topups: lotTransfers(row).map((transfer) => ({
          date: transfer.date,
          heads: transfer.heads,
        })),
      })),
      selectedAgentDailyForFifo,
    )
    const summaries = fifo.summaries.map((row) => ({ ...row }))
    const byLotId = new Map(
      [...fifo.byLotId.entries()].map(([id, days]) => [id, days.map((day) => ({ ...day }))]),
    )
    const known = new Set(summaries.map((row) => row.allotmentId))
    for (const row of selectedAgentDaily) {
      if (!row.allotmentId || row.totalDeduct <= 0 || !known.has(row.allotmentId)) continue
      const list = byLotId.get(row.allotmentId) ?? []
      const existing = list.find((item) => item.day === row.day)
      if (existing) existing.heads += row.totalDeduct
      else list.push({ day: row.day, heads: row.totalDeduct })
      list.sort((a, b) => a.day.localeCompare(b.day))
      byLotId.set(row.allotmentId, list)
      const summary = summaries.find((item) => item.allotmentId === row.allotmentId)
      if (!summary) continue
      summary.used += row.totalDeduct
      summary.remaining = summary.purchased - summary.used
    }
    return { summaries, byLotId }
  }, [selectedAgentRows, selectedAgentDailyForFifo, selectedAgentDaily])

  const selectedAgentUsageByLot = useMemo(
    () => lotUsageMap(selectedAgentFifo.summaries),
    [selectedAgentFifo.summaries],
  )

  const selectedAgentSummary = agentSummaries.find((row) => row.slug === selectedAgentSlug) ?? null

  const selectedLot = useMemo(
    () => rows.find((row) => row.id === selectedLotId) ?? null,
    [rows, selectedLotId],
  )

  const selectedLotUsage: LotUsageSummary | null = useMemo(() => {
    if (!selectedLot) return null
    return (
      selectedAgentUsageByLot.get(selectedLot.id) ?? {
        allotmentId: selectedLot.id,
        purchased: selectedLot.seats,
        used: 0,
        remaining: selectedLot.seats,
      }
    )
  }, [selectedLot, selectedAgentUsageByLot])

  const agentDayPax = useMemo(() => {
    const map = new Map<string, { adults: number; children: number }>()
    for (const row of bookingDayPax) {
      map.set(row.day, { adults: row.adults, children: row.children })
    }
    return map
  }, [bookingDayPax])

  /** Latest 3 lots for the agent — history panels on lot detail (no page hop). */
  const recentLotsHistory = useMemo(() => {
    const newestFirst = [...selectedAgentRows].reverse().slice(0, 3)
    return newestFirst.map((lot) => {
      const usage = selectedAgentUsageByLot.get(lot.id) ?? {
        allotmentId: lot.id,
        purchased: lot.seats,
        used: 0,
        remaining: lot.seats,
      }
      let seatLeft = usage.purchased
      let totalAdults = 0
      let totalChildren = 0
      let totalAmount = 0
      const dayUsage = (selectedAgentFifo.byLotId.get(lot.id) ?? []).map((item) => {
        seatLeft -= item.heads
        const dayPax = agentDayPax.get(item.day) ?? { adults: 0, children: 0 }
        const split = splitAllocatedPax(item.heads, dayPax.adults, dayPax.children)
        const amount =
          split.adults * Math.max(0, lot.adultPrice) +
          split.children * Math.max(0, lot.childPrice)
        totalAdults += split.adults
        totalChildren += split.children
        totalAmount += amount
        return {
          day: item.day,
          heads: item.heads,
          seatLeftBalance: seatLeft,
          adults: split.adults,
          children: split.children,
          amount,
        }
      })
      return {
        lot,
        usage,
        payments: [...allotmentPayments(lot)].sort((a, b) => a.paidDate.localeCompare(b.paidDate)),
        dayUsage,
        usageTotals: {
          heads: dayUsage.reduce((sum, row) => sum + row.heads, 0),
          adults: totalAdults,
          children: totalChildren,
          amount: totalAmount,
        },
        paid: allotmentPaidTotal(lot),
        due: allotmentBalance(lot),
        status: allotmentPayStatus(lot),
        date: lot.paidDate || lot.createdAt.slice(0, 10),
        isCurrent: lot.id === selectedLotId,
      }
    })
  }, [
    selectedAgentRows,
    selectedAgentUsageByLot,
    selectedAgentFifo.byLotId,
    selectedLotId,
    agentDayPax,
  ])

  /** Oldest lot that still has heads left (FIFO in progress); else newest if overdrawn. */
  const activeWorkingLotId = useMemo(() => {
    const summaries = selectedAgentFifo.summaries
    if (summaries.length === 0) return ''
    const withLeft = summaries.find((row) => row.remaining > 0)
    if (withLeft) return withLeft.allotmentId
    const overdrawn = [...summaries].reverse().find((row) => row.remaining < 0)
    return overdrawn?.allotmentId ?? summaries[summaries.length - 1]!.allotmentId
  }, [selectedAgentFifo.summaries])

  const bookSourceDaily = useMemo(
    () =>
      selectedAgentDaily.filter(
        (row) =>
          row.totalDeduct > 0 &&
          (!earliestLotOpen || row.day >= earliestLotOpen) &&
          (Boolean(row.allotmentId) || row.day <= today),
      ),
    [selectedAgentDaily, earliestLotOpen, today],
  )

  const depositBook = useMemo(
    () => buildDepositBook(selectedAgentRows, bookSourceDaily),
    [selectedAgentRows, bookSourceDaily],
  )
  const lotBooks = useMemo(
    () =>
      buildLotBooks(
        selectedAgentRows,
        selectedAgentFifo,
        selectedAgentDaily,
        selectedAgentDailyForFifo,
        activeWorkingLotId,
      ),
    [
      selectedAgentRows,
      selectedAgentFifo,
      selectedAgentDaily,
      selectedAgentDailyForFifo,
      activeWorkingLotId,
    ],
  )
  const fifoUsed = selectedAgentFifo.summaries.reduce((sum, row) => sum + row.used, 0)
  const fifoPurchased = selectedAgentFifo.summaries.reduce((sum, row) => sum + row.purchased, 0)
  const bookHeadsLeft = fifoPurchased - fifoUsed
  const bookRate = selectedAgentRows.at(-1)?.adultPrice ?? 0
  const receivingLotId = selectedAgentRows.find((row) => row.receivesBookings)?.id ?? ''
  const pendingChecker = useMemo(() => {
    const savedDays = new Set(selectedAgentDaily.map((row) => row.day))
    const days = bookingDayPax.filter((row) => {
      if (row.totalDeduct <= 0) return false
      if (earliestLotOpen && row.day < earliestLotOpen) return false
      if (row.day > today) return false
      return !savedDays.has(row.day)
    })
    return {
      days: days.length,
      heads: days.reduce((sum, row) => sum + row.totalDeduct, 0),
    }
  }, [bookingDayPax, earliestLotOpen, selectedAgentDaily, today])
  const resolvedLotTabId =
    bookTab === 'book'
      ? ''
      : bookTab === 'active' || !lotBooks.some((book) => book.lotId === bookTab)
        ? receivingLotId || activeWorkingLotId
        : bookTab
  const selectedLotBook = lotBooks.find((book) => book.lotId === resolvedLotTabId) ?? null

  useEffect(() => {
    const root = lotTabStripRef.current
    if (!root || view !== 'agent') return
    const tabId = bookTab === 'book' ? 'book' : resolvedLotTabId
    const el = root.querySelector(`[data-lot-tab="${tabId}"]`)
    if (!(el instanceof HTMLElement)) return
    const left = el.offsetLeft - root.clientWidth / 2 + el.clientWidth / 2
    root.scrollTo({ left: Math.max(0, left) })
  }, [view, bookTab, resolvedLotTabId, selectedAgentSlug, lotBooks.length])

  function openAgent(slug: string) {
    const summary = agentSummaries.find((row) => row.slug === slug)
    const latest = rows
      .filter((row) => row.agentSlug === slug)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    setSelectedAgentSlug(slug)
    setSelectedLotId('')
    setLedgerError('')
    setShowLots(false)
    setBookTab('active')
    setLedgerDraft({
      ...emptyDraft(),
      agentSlug: slug,
      adultPrice: String(latest?.adultPrice || summary?.adultPrice || ''),
      childPrice: String(latest?.childPrice || summary?.childPrice || ''),
      parkFee: latest?.parkFee || 'exc',
    })
    setView('agent')
  }

  function openLot(row: AgentAllotment) {
    setSelectedAgentSlug(row.agentSlug)
    setSelectedLotId(row.id)
    setPaymentErrorByLot((current) => {
      const next = { ...current }
      delete next[row.id]
      return next
    })
    setPaymentDraftByLot((current) => ({
      ...current,
      [row.id]: current[row.id] ?? emptyPaymentDraft(),
    }))
    setView('lot')
  }

  function paymentDraftFor(lotId: string) {
    return paymentDraftByLot[lotId] ?? emptyPaymentDraft()
  }

  function patchPaymentDraft(lotId: string, patch: Partial<PaymentDraft>) {
    setPaymentDraftByLot((current) => ({
      ...current,
      [lotId]: { ...(current[lotId] ?? emptyPaymentDraft()), ...patch },
    }))
  }

  async function refresh() {
    const [next, daily] = await Promise.all([listAgentAllotments(), listAgentAllotmentDaily()])
    setRows(next)
    setDailyRows(daily)
  }

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setLoadError('')
      try {
        const [next, daily] = await Promise.all([listAgentAllotments(), listAgentAllotmentDaily()])
        if (!cancelled) {
          setRows(next)
          setDailyRows(daily)
        }
      } catch (caught) {
        if (!cancelled) {
          setLoadError(caught instanceof Error ? caught.message : 'Could not load allotments.')
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

  useEffect(() => {
    let cancelled = false
    if (!selectedAgentSlug) {
      setBookingDayPax([])
      return
    }
    setAdvanceExpanded(false)
    void fetchAgentBookingDayPax(selectedAgentSlug)
      .then((rows) => {
        if (!cancelled) setBookingDayPax(rows)
      })
      .catch((caught) => {
        console.error('[allotment] booking day pax failed', caught)
        if (!cancelled) setBookingDayPax([])
      })
    return () => {
      cancelled = true
    }
  }, [selectedAgentSlug])

  function resolveExistingAgent(slug: string) {
    const agent = agentOptions.find((item) => item.slug === slug)
    if (!agent) return null
    return { slug: agent.slug, name: agent.name }
  }

  function resolveOrCreateAgent(draftValue: Draft): { slug: string; name: string } | { error: string } {
    if (draftValue.agentSlug === NEW_AGENT_VALUE) {
      const trimmed = draftValue.newAgentName.trim().replace(/\s+/g, ' ')
      if (!trimmed) return { error: 'Enter a new agent name.' }
      const existing = agentOptions.find(
        (agent) => agent.name.toLowerCase() === trimmed.toLowerCase(),
      )
      if (existing) return { slug: existing.slug, name: existing.name }
      const createError = addAgent(trimmed)
      if (createError) return { error: createError }
      const slug = uniqueAgentSlug(
        trimmed,
        agentOptions.map((agent) => agent.slug),
      )
      return { slug, name: trimmed }
    }
    const agent = resolveExistingAgent(draftValue.agentSlug)
    if (!agent) return { error: 'Choose an agent, or add a new one.' }
    return agent
  }

  async function handleAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAddError('')
    const agent = resolveOrCreateAgent(draft)
    if ('error' in agent) {
      setAddError(agent.error)
      return
    }
    const adultPrice = parseMoney(draft.adultPrice)
    const childPrice = parseMoney(draft.childPrice)
    const heads = parseHeads(draft.heads || '0')
    if (!Number.isFinite(adultPrice) || adultPrice < 0) {
      setAddError('Enter a valid AD price / head.')
      return
    }
    if (!Number.isFinite(childPrice) || childPrice < 0) {
      setAddError('Enter a valid CH price / head.')
      return
    }
    if (!Number.isFinite(heads) || heads <= 0) {
      setAddError('Enter total heads for this lot.')
      return
    }
    if (!isIsoDate(draft.paidDate)) {
      setAddError('Enter the lot / first transfer date.')
      return
    }
    const totals = draftTotals(draft)
    const paidAmountRaw = draft.paidAmount.trim() ? parseMoney(draft.paidAmount) : 0
    if (!Number.isFinite(paidAmountRaw) || paidAmountRaw < 0) {
      setAddError('Enter a valid paid amount (0 if not transferred yet).')
      return
    }
    if (paidAmountRaw - totals.totalAmount > 0.009) {
      setAddError('Paid now cannot exceed the lot total.')
      return
    }
    setAdding(true)
    try {
      const created = await createAgentAllotment({
        agentSlug: agent.slug,
        agentName: agent.name,
        adultSeats: heads,
        childSeats: 0,
        adultPrice,
        childPrice,
        parkFee: draft.parkFee,
        paidDate: draft.paidDate.trim(),
        paidAmount: paidAmountRaw,
        note: draft.note,
      })
      await setAgentAllotmentReceiving(created.agentSlug, created.id)
      setDraft(emptyDraft())
      await refresh()
      openLot(created)
    } catch (caught) {
      setAddError(caught instanceof Error ? caught.message : 'Could not save allotment.')
    } finally {
      setAdding(false)
    }
  }

  function openEdit(row: AgentAllotment) {
    setEditing(row)
    setEditDraft({
      agentSlug: row.agentSlug,
      newAgentName: '',
      adultPrice: row.adultPrice ? String(row.adultPrice) : '',
      childPrice: row.childPrice ? String(row.childPrice) : '',
      parkFee: row.parkFee,
      heads: seatsToDraftHeads(row),
      paidAmount: String(allotmentPaidTotal(row)),
      paidDate: row.paidDate || todayISO(),
      note: row.note,
    })
    setEditError('')
  }

  async function handleLedgerTopUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLedgerError('')
    const agent =
      resolveExistingAgent(selectedAgentSlug) ||
      (() => {
        const name =
          selectedAgentSummary?.name ||
          agents.find((item) => item.slug === selectedAgentSlug)?.name ||
          selectedAgentSlug
        return selectedAgentSlug ? { slug: selectedAgentSlug, name } : null
      })()
    if (!agent) {
      setLedgerError('Agent not found.')
      return
    }
    const adultPrice = parseMoney(ledgerDraft.adultPrice)
    const childPrice = parseMoney(ledgerDraft.childPrice)
    const heads = parseHeads(ledgerDraft.heads || '0')
    if (!Number.isFinite(adultPrice) || adultPrice < 0) {
      setLedgerError('Enter a valid AD price / head.')
      return
    }
    if (!Number.isFinite(childPrice) || childPrice < 0) {
      setLedgerError('Enter a valid CH price / head.')
      return
    }
    if (!Number.isFinite(heads) || heads <= 0) {
      setLedgerError('Enter total heads for this lot.')
      return
    }
    if (!isIsoDate(ledgerDraft.paidDate)) {
      setLedgerError('Enter the lot / first transfer date.')
      return
    }
    const totals = draftTotals(ledgerDraft)
    const paidAmountRaw = ledgerDraft.paidAmount.trim() ? parseMoney(ledgerDraft.paidAmount) : 0
    if (!Number.isFinite(paidAmountRaw) || paidAmountRaw < 0) {
      setLedgerError('Enter a valid paid amount (0 if not transferred yet).')
      return
    }
    if (paidAmountRaw - totals.totalAmount > 0.009) {
      setLedgerError('Paid now cannot exceed the lot total.')
      return
    }
    setSavingLedger(true)
    try {
      const created = await createAgentAllotment({
        agentSlug: agent.slug,
        agentName: agent.name,
        adultSeats: heads,
        childSeats: 0,
        adultPrice,
        childPrice,
        parkFee: ledgerDraft.parkFee,
        paidDate: ledgerDraft.paidDate.trim(),
        paidAmount: paidAmountRaw,
        note: ledgerDraft.note,
      })
      await setAgentAllotmentReceiving(created.agentSlug, created.id)
      setLedgerDraft((current) => ({
        ...emptyDraft(),
        agentSlug: agent.slug,
        adultPrice: current.adultPrice,
        childPrice: current.childPrice,
        parkFee: current.parkFee,
      }))
      await refresh()
      openLot(created)
    } catch (caught) {
      setLedgerError(caught instanceof Error ? caught.message : 'Could not save allotment.')
    } finally {
      setSavingLedger(false)
    }
  }

  async function handleTopUpCurrentLot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setTopUpError('')
    const targetId =
      bookTab !== 'book' && selectedLotBook ? selectedLotBook.lotId : activeWorkingLotId
    const lot =
      selectedAgentRows.find((row) => row.id === targetId) ?? selectedAgentRows.at(-1) ?? null
    if (!lot) {
      setTopUpError('เปิดล็อตก่อน แล้วค่อยโอนเพิ่มเข้าล็อตนั้น')
      return
    }
    const heads = parseHeads(topUpDraft.heads)
    const amount = parseMoney(topUpDraft.amount)
    if (!Number.isFinite(heads) || heads <= 0) {
      setTopUpError('ใส่จำนวนหัวที่โอนเพิ่ม')
      return
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setTopUpError('ใส่จำนวนเงินที่โอน')
      return
    }
    if (!isIsoDate(topUpDraft.paidDate)) {
      setTopUpError('ใส่วันที่โอน')
      return
    }
    const remaining = selectedAgentUsageByLot.get(lot.id)?.remaining ?? lot.seats
    setSavingTopUp(true)
    try {
      if (remaining <= 0) {
        const created = await createAgentAllotment({
          agentSlug: lot.agentSlug,
          agentName: lot.agentName,
          adultSeats: heads,
          childSeats: 0,
          adultPrice: lot.adultPrice,
          childPrice: lot.childPrice,
          parkFee: lot.parkFee,
          paidDate: topUpDraft.paidDate,
          paidAmount: amount,
          note: topUpDraft.note,
        })
        await setAgentAllotmentReceiving(created.agentSlug, created.id)
        setBookTab(created.id)
      } else {
        await topUpAgentAllotment(lot.id, {
          heads,
          amount,
          paidDate: topUpDraft.paidDate,
          note: topUpDraft.note,
        })
        setBookTab(lot.id)
      }
      setTopUpDraft({ paidDate: todayISO(), heads: '', amount: '', note: '' })
      await refresh()
    } catch (caught) {
      setTopUpError(caught instanceof Error ? caught.message : 'บันทึกโอนเพิ่มไม่ได้')
    } finally {
      setSavingTopUp(false)
    }
  }

  async function moveSavedDay(day: string, allotmentId: string) {
    if (!selectedAgentSlug) return
    try {
      await moveAgentAllotmentDaily({
        day,
        agentSlug: selectedAgentSlug,
        allotmentId,
      })
      await refresh()
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Could not move this day.')
    }
  }

  async function handleAddPaymentForLot(lotId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const draft = paymentDraftFor(lotId)
    setPaymentErrorByLot((current) => {
      const next = { ...current }
      delete next[lotId]
      return next
    })
    const amount = parseMoney(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentErrorByLot((current) => ({
        ...current,
        [lotId]: 'Enter a payment amount greater than 0.',
      }))
      return
    }
    if (!isIsoDate(draft.paidDate)) {
      setPaymentErrorByLot((current) => ({
        ...current,
        [lotId]: 'Enter a valid transfer date.',
      }))
      return
    }
    setSavingPaymentLotId(lotId)
    try {
      await addAgentAllotmentPayment(lotId, {
        amount,
        paidDate: draft.paidDate.trim(),
        note: draft.note,
      })
      setPaymentDraftByLot((current) => ({
        ...current,
        [lotId]: emptyPaymentDraft(),
      }))
      await refresh()
    } catch (caught) {
      setPaymentErrorByLot((current) => ({
        ...current,
        [lotId]: caught instanceof Error ? caught.message : 'Could not save payment.',
      }))
    } finally {
      setSavingPaymentLotId(null)
    }
  }

  async function handleRemoveLastPaymentForLot(lotId: string) {
    if (!window.confirm('Remove the latest payment on this lot?')) return
    try {
      await removeLastAgentAllotmentPayment(lotId)
      await refresh()
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Could not remove payment.')
    }
  }

  async function handleEditSave() {
    if (!editing) return
    setEditError('')
    const agent = resolveOrCreateAgent(editDraft)
    if ('error' in agent) {
      setEditError(agent.error)
      return
    }
    const adultPrice = parseMoney(editDraft.adultPrice)
    const childPrice = parseMoney(editDraft.childPrice)
    const heads = parseHeads(editDraft.heads || '0')
    if (!Number.isFinite(adultPrice) || adultPrice < 0) {
      setEditError('Enter a valid AD price / head.')
      return
    }
    if (!Number.isFinite(childPrice) || childPrice < 0) {
      setEditError('Enter a valid CH price / head.')
      return
    }
    if (!Number.isFinite(heads) || heads <= 0) {
      setEditError('Enter total heads for this lot.')
      return
    }
    setSavingEdit(true)
    try {
      await updateAgentAllotment(editing.id, {
        agentSlug: agent.slug,
        agentName: agent.name,
        adultSeats: heads,
        childSeats: 0,
        adultPrice,
        childPrice,
        parkFee: editDraft.parkFee,
        paidDate: editDraft.paidDate || editing.paidDate || todayISO(),
        note: editDraft.note,
      })
      setEditing(null)
      await refresh()
      if (agent.slug !== selectedAgentSlug && view === 'agent') {
        openAgent(agent.slug)
      }
    } catch (caught) {
      setEditError(caught instanceof Error ? caught.message : 'Could not update allotment.')
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(row: AgentAllotment) {
    if (!window.confirm(`Remove this lot for ${row.agentName}?`)) return
    try {
      await deleteAgentAllotment(row.id)
      if (selectedLotId === row.id) {
        setSelectedLotId('')
        setView('agent')
      }
      await refresh()
    } catch (caught) {
      window.alert(caught instanceof Error ? caught.message : 'Could not remove lot.')
    }
  }

  if (view === 'hub') {
    return (
      <div className="w-full">
        <PageHeader
          title="Agent Allotment"
          description="Open lots per agent, record transfers on each lot, and track heads used (FIFO from oldest lot)."
        />
        <div className="grid gap-4 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3">
          <AllotmentModeCard
            tone="teal"
            title="Lots & payments"
            subtitle="Open a new lot, add transfers on that lot, and see paid / due / heads used / overage."
            meta="Lots"
            icon={<Plus className="size-7" strokeWidth={1.75} />}
            onClick={() => {
              setDraft(emptyDraft())
              setAddError('')
              setView('add')
            }}
          />
          <AllotmentModeCard
            tone="sky"
            title="Daily checker"
            subtitle="Each tour date: Booking Head, Check in, No Show, Invoice, and editable Total Deduct."
            meta="Deduct heads"
            icon={<CalendarCheck2 className="size-7" strokeWidth={1.75} />}
            onClick={() => setView('daily')}
          />
          <AllotmentModeCard
            tone="amber"
            title="Allotment history"
            subtitle="Bookings used, Daily checker heads, and seats left per agent."
            meta="Usage & balance"
            icon={<History className="size-7" strokeWidth={1.75} />}
            onClick={() => setView('history')}
          />
        </div>
      </div>
    )
  }

  if (view === 'daily') {
    return <AdminAgentAllotmentDailyChecker onBack={() => setView('hub')} />
  }

  if (view === 'history') {
    return (
      <AdminAgentAllotmentHistory
        onBack={() => setView('hub')}
        onAdd={() => {
          setDraft(emptyDraft())
          setAddError('')
          setView('add')
        }}
      />
    )
  }

  if (view === 'lot' && selectedLot && selectedLotUsage) {
    const paid = allotmentPaidTotal(selectedLot)
    const due = allotmentBalance(selectedLot)
    const status = allotmentPayStatus(selectedLot)
    const lotDate = selectedLot.paidDate || selectedLot.createdAt.slice(0, 10)
    const overage =
      selectedLotUsage.remaining < 0 ? Math.abs(selectedLotUsage.remaining) : 0

    return (
      <div className="w-full">
        <PageHeader
          title={selectedLot.note.trim() || `Lot · ${formatShortDate(lotDate)}`}
          description={`${selectedLot.agentName} — heads, transfers, and usage for this lot (FIFO from oldest).`}
          actions={
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSelectedLotId('')
                setView('agent')
              }}
            >
              <ArrowLeft className="size-3.5" />
              Back to agent
            </Button>
          }
        />

        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Surface className="px-4 py-3">
            <p className="text-xs text-teal-900/45">Lot heads</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-teal-950">
              {selectedLotUsage.purchased}
            </p>
            <p className="mt-0.5 text-[11px] text-teal-900/45">
              {formatMoney(selectedLot.totalAmount)} THB · Park Fee{' '}
              {formatAllotmentParkFee(selectedLot.parkFee)}
            </p>
          </Surface>
          <Surface className="px-4 py-3">
            <p className="text-xs text-teal-900/45">Used / left</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-teal-950">
              {selectedLotUsage.used}
              <span className="mx-1 text-teal-900/30">/</span>
              <span
                className={cn(
                  selectedLotUsage.remaining < 0 ? 'text-rose-700' : 'text-teal-800',
                )}
              >
                {selectedLotUsage.remaining}
              </span>
            </p>
            {overage > 0 ? (
              <p className="mt-0.5 text-[11px] font-medium text-rose-700">Over by {overage}</p>
            ) : (
              <p className="mt-0.5 text-[11px] text-teal-900/45">FIFO from older lots first</p>
            )}
          </Surface>
          <Surface className="px-4 py-3">
            <p className="text-xs text-teal-900/45">Paid</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-teal-800">
              {formatMoney(paid)} THB
            </p>
            <span
              className={cn(
                'mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset',
                payStatusClass(status),
              )}
            >
              {payStatusLabel(status)}
            </span>
          </Surface>
          <Surface className="px-4 py-3">
            <p className="text-xs text-teal-900/45">Still due</p>
            <p
              className={cn(
                'mt-1 text-lg font-semibold tabular-nums',
                due > 0.009 ? 'text-amber-800' : 'text-teal-800',
              )}
            >
              {formatMoney(due)} THB
            </p>
            <p className="mt-0.5 text-[11px] text-teal-900/45">
              of {formatMoney(selectedLot.totalAmount)} lot total
            </p>
          </Surface>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            onClick={() => openAgent(selectedLot.agentSlug)}
          >
            <Plus data-icon="inline-start" />
            Add allotment
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => openEdit(selectedLot)}>
            <Pencil data-icon="inline-start" />
            Edit lot
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-neutral-500 hover:text-red-600"
            onClick={() => void handleDelete(selectedLot)}
          >
            <Trash2 data-icon="inline-start" />
            Delete lot
          </Button>
        </div>

        <div className="mb-5 grid gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2">
              <h2 className="text-sm font-semibold text-teal-950">Transfers</h2>
              <p className="text-xs text-teal-900/45">
                Latest {recentLotsHistory.length} lot
                {recentLotsHistory.length === 1 ? '' : 's'} — partial pay on each card.
              </p>
            </div>
            {recentLotsHistory.length === 0 ? (
              <Surface className="p-5 text-sm text-teal-900/55">No lots yet.</Surface>
            ) : (
              <div className="space-y-3">
                {recentLotsHistory.map((entry) => (
                  <Surface
                    key={`pay-${entry.lot.id}`}
                    className={cn(
                      'overflow-hidden p-0',
                      entry.lot.id === activeWorkingLotId
                        ? 'ring-2 ring-orange-500/35'
                        : entry.isCurrent && 'ring-2 ring-teal-700/20',
                    )}
                  >
                    <div className="space-y-2 border-b border-teal-900/8 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-teal-950">
                              {entry.lot.note.trim() || `Lot · ${formatShortDate(entry.date)}`}
                            </p>
                            {entry.isCurrent ? (
                              <span className="rounded-full bg-teal-950/6 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-teal-800 uppercase">
                                Current
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="text-[11px] font-semibold text-teal-700 underline-offset-2 hover:underline"
                                onClick={() => openLot(entry.lot)}
                              >
                                Open
                              </button>
                            )}
                            {entry.lot.id === activeWorkingLotId ? (
                              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-orange-700 uppercase ring-1 ring-inset ring-orange-500/25">
                                In use
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[11px] text-teal-900/45">
                            Opened {formatShortDate(entry.date)} · AD{' '}
                            {formatMoney(entry.lot.adultPrice)} / CH{' '}
                            {formatMoney(entry.lot.childPrice)} · Park{' '}
                            {formatAllotmentParkFee(entry.lot.parkFee)}
                          </p>
                        </div>
                        <LotCardCashBadge paid={entry.paid} lotTotal={entry.lot.totalAmount} />
                      </div>
                      <LotCardStats
                        paid={entry.paid}
                        lotHeads={entry.lot.seats}
                        lotTotal={entry.lot.totalAmount}
                        usedAmount={entry.usageTotals.amount}
                        usedHeads={entry.usageTotals.heads}
                        usedAdults={entry.usageTotals.adults}
                        usedChildren={entry.usageTotals.children}
                        headsLeft={entry.usage.remaining}
                        isActive={entry.lot.id === activeWorkingLotId}
                      />
                    </div>
                    {entry.payments.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-teal-900/50">No transfers yet.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="px-4 text-teal-700/45">Date</TableHead>
                            <TableHead className="text-teal-700/45">Note</TableHead>
                            <TableHead className="text-right text-teal-700/45">Amount</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {entry.payments.map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell className="px-4 whitespace-nowrap">
                                {formatShortDate(payment.paidDate)}
                              </TableCell>
                              <TableCell className="text-teal-900/70">
                                {payment.note || '—'}
                              </TableCell>
                              <TableCell className="text-right font-semibold tabular-nums">
                                {formatMoney(payment.amount)}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                    <div className="border-t border-teal-900/8 px-4 py-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-xs font-semibold text-teal-950">Partial pay</p>
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset',
                              payStatusClass(entry.status),
                            )}
                          >
                            {payStatusLabel(entry.status)}
                          </span>
                        </div>
                        {entry.payments.length > 0 ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleRemoveLastPaymentForLot(entry.lot.id)}
                          >
                            Undo last
                          </Button>
                        ) : null}
                      </div>
                      {entry.due <= 0.009 ? (
                        <p className="text-xs text-teal-900/45">This lot is fully paid.</p>
                      ) : (
                        <form
                          className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
                          onSubmit={(event) => void handleAddPaymentForLot(entry.lot.id, event)}
                        >
                          <div className="space-y-1">
                            <Label className="text-[11px] text-neutral-400">Date</Label>
                            <Input
                              type="date"
                              required
                              value={paymentDraftFor(entry.lot.id).paidDate}
                              onChange={(event) =>
                                patchPaymentDraft(entry.lot.id, {
                                  paidDate: event.target.value,
                                })
                              }
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-neutral-400">Amount</Label>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              required
                              value={paymentDraftFor(entry.lot.id).amount}
                              onChange={(event) =>
                                patchPaymentDraft(entry.lot.id, {
                                  amount: event.target.value,
                                })
                              }
                              placeholder={String(entry.due)}
                              className="h-9"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[11px] text-neutral-400">Note</Label>
                            <Input
                              value={paymentDraftFor(entry.lot.id).note}
                              onChange={(event) =>
                                patchPaymentDraft(entry.lot.id, {
                                  note: event.target.value,
                                })
                              }
                              placeholder="Transfer note"
                              className="h-9"
                            />
                          </div>
                          <div className="flex items-end">
                            <Button
                              type="submit"
                              disabled={savingPaymentLotId === entry.lot.id}
                              className="h-9 w-full"
                              size="sm"
                            >
                              <Plus data-icon="inline-start" />
                              {savingPaymentLotId === entry.lot.id ? 'Saving…' : 'Add pay'}
                            </Button>
                          </div>
                        </form>
                      )}
                      {paymentErrorByLot[entry.lot.id] ? (
                        <p className="mt-2 text-sm text-red-600">
                          {paymentErrorByLot[entry.lot.id]}
                        </p>
                      ) : null}
                    </div>
                  </Surface>
                ))}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2">
              <h2 className="text-sm font-semibold text-teal-950">Heads used</h2>
              <p className="text-xs text-teal-900/45">
                Latest {recentLotsHistory.length} lot
                {recentLotsHistory.length === 1 ? '' : 's'} — Daily use Head & Seat Left Balance.
              </p>
            </div>
            {recentLotsHistory.length === 0 ? (
              <Surface className="p-5 text-sm text-teal-900/55">No lots yet.</Surface>
            ) : (
              <div className="space-y-3">
                {recentLotsHistory.map((entry) => (
                  <Surface
                    key={`use-${entry.lot.id}`}
                    className={cn(
                      'overflow-hidden p-0',
                      entry.lot.id === activeWorkingLotId
                        ? 'ring-2 ring-orange-500/35'
                        : entry.isCurrent && 'ring-2 ring-teal-700/20',
                    )}
                  >
                    <div className="space-y-2 border-b border-teal-900/8 px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-teal-950">
                              {entry.lot.note.trim() || `Lot · ${formatShortDate(entry.date)}`}
                            </p>
                            {entry.isCurrent ? (
                              <span className="rounded-full bg-teal-950/6 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-teal-800 uppercase">
                                Current
                              </span>
                            ) : (
                              <button
                                type="button"
                                className="text-[11px] font-semibold text-teal-700 underline-offset-2 hover:underline"
                                onClick={() => openLot(entry.lot)}
                              >
                                Open
                              </button>
                            )}
                            {entry.lot.id === activeWorkingLotId ? (
                              <span className="rounded-full bg-orange-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-orange-700 uppercase ring-1 ring-inset ring-orange-500/25">
                                In use
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 text-[11px] text-teal-900/45">
                            Opened {formatShortDate(entry.date)} · AD{' '}
                            {formatMoney(entry.lot.adultPrice)} / CH{' '}
                            {formatMoney(entry.lot.childPrice)} · Park{' '}
                            {formatAllotmentParkFee(entry.lot.parkFee)}
                          </p>
                        </div>
                        <LotCardCashBadge paid={entry.paid} lotTotal={entry.lot.totalAmount} />
                      </div>
                      <LotCardStats
                        paid={entry.paid}
                        lotHeads={entry.lot.seats}
                        lotTotal={entry.lot.totalAmount}
                        usedAmount={entry.usageTotals.amount}
                        usedHeads={entry.usageTotals.heads}
                        usedAdults={entry.usageTotals.adults}
                        usedChildren={entry.usageTotals.children}
                        headsLeft={entry.usage.remaining}
                        isActive={entry.lot.id === activeWorkingLotId}
                      />
                    </div>
                    {entry.dayUsage.length === 0 &&
                    !(
                      entry.lot.id === activeWorkingLotId && advanceBookingPreview.heads > 0
                    ) ? (
                      <p className="px-4 py-3 text-sm text-teal-900/50">No usage on this lot yet.</p>
                    ) : (
                      <>
                        <Table>
                          <TableHeader>
                            <TableRow className="hover:bg-transparent">
                              <TableHead className="h-8 px-3 py-1 text-xs text-teal-700/45">
                                Tour date
                              </TableHead>
                              <TableHead className="h-8 py-1 text-right text-xs text-teal-700/45">
                                Daily use Head
                              </TableHead>
                              <TableHead className="h-8 py-1 text-right text-xs text-teal-700/45">
                                Seat Left Balance
                              </TableHead>
                              <TableHead className="h-8 py-1 text-right text-xs text-teal-700/45">
                                Amount
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {[...entry.dayUsage].reverse().map((item) => (
                              <TableRow key={`${entry.lot.id}-${item.day}`} className="h-8">
                                <TableCell className="px-3 py-1 text-sm whitespace-nowrap">
                                  {formatShortDate(item.day)}
                                </TableCell>
                                <TableCell className="py-1 text-right">
                                  <DailyUseHeadCell
                                    adults={item.adults}
                                    children={item.children}
                                    heads={item.heads}
                                  />
                                </TableCell>
                                <TableCell
                                  className={cn(
                                    'py-1 text-right text-sm font-semibold tabular-nums',
                                    item.seatLeftBalance < 0
                                      ? 'text-rose-700'
                                      : 'text-teal-800',
                                  )}
                                >
                                  {item.seatLeftBalance}
                                </TableCell>
                                <TableCell className="py-1 text-right text-sm font-semibold tabular-nums text-teal-950">
                                  {formatMoney(item.amount)} THB
                                </TableCell>
                              </TableRow>
                            ))}
                            {entry.lot.id === activeWorkingLotId &&
                            advanceBookingPreview.heads > 0 ? (
                              <>
                                <TableRow className="h-9 border-t border-dashed border-amber-500/25 bg-amber-50/40 hover:bg-amber-50/55">
                                  <TableCell className="px-3 py-1" colSpan={1}>
                                    <button
                                      type="button"
                                      className="inline-flex max-w-full items-center gap-1.5 text-left"
                                      onClick={() => setAdvanceExpanded((open) => !open)}
                                      aria-expanded={advanceExpanded}
                                    >
                                      {advanceExpanded ? (
                                        <ChevronDown className="size-3.5 shrink-0 text-amber-700" />
                                      ) : (
                                        <ChevronRight className="size-3.5 shrink-0 text-amber-700" />
                                      )}
                                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-amber-800 uppercase ring-1 ring-inset ring-amber-500/25">
                                        Advance
                                      </span>
                                      <span className="truncate text-[11px] text-amber-900/55">
                                        not deducted yet · {advanceBookingPreview.days.length} day
                                        {advanceBookingPreview.days.length === 1 ? '' : 's'}
                                      </span>
                                    </button>
                                  </TableCell>
                                  <TableCell className="py-1 text-right">
                                    <DailyUseHeadCell
                                      adults={advanceBookingPreview.adults}
                                      children={advanceBookingPreview.children}
                                      heads={advanceBookingPreview.heads}
                                    />
                                  </TableCell>
                                  <TableCell className="py-1 text-right text-xs font-medium text-amber-800/55">
                                    —
                                  </TableCell>
                                  <TableCell className="py-1 text-right text-xs font-medium text-amber-800/55">
                                    —
                                  </TableCell>
                                </TableRow>
                                {advanceExpanded
                                  ? [...advanceBookingPreview.days].reverse().map((item) => (
                                      <TableRow
                                        key={`advance-${entry.lot.id}-${item.day}`}
                                        className="h-8 bg-amber-50/20 hover:bg-amber-50/35"
                                      >
                                        <TableCell className="px-3 py-1 pl-9 text-sm whitespace-nowrap text-teal-900/70">
                                          {formatShortDate(item.day)}
                                        </TableCell>
                                        <TableCell className="py-1 text-right">
                                          <DailyUseHeadCell
                                            adults={item.adults}
                                            children={item.children}
                                            heads={item.heads}
                                          />
                                        </TableCell>
                                        <TableCell className="py-1 text-right text-xs text-teal-900/35">
                                          —
                                        </TableCell>
                                        <TableCell className="py-1 text-right text-xs text-teal-900/35">
                                          —
                                        </TableCell>
                                      </TableRow>
                                    ))
                                  : null}
                              </>
                            ) : null}
                            <TableRow className="h-8 border-t-2 border-teal-900/15 bg-teal-950/[0.03] hover:bg-teal-950/[0.03]">
                              <TableCell className="px-3 py-1 text-sm font-semibold text-teal-950">
                                Summary
                              </TableCell>
                              <TableCell className="py-1 text-right">
                                <DailyUseHeadCell
                                  adults={entry.usageTotals.adults}
                                  children={entry.usageTotals.children}
                                  heads={entry.usageTotals.heads}
                                />
                              </TableCell>
                              <TableCell
                                className={cn(
                                  'py-1 text-right text-sm font-semibold tabular-nums',
                                  entry.usage.remaining < 0 ? 'text-rose-700' : 'text-teal-800',
                                )}
                              >
                                {entry.usage.remaining}
                              </TableCell>
                              <TableCell className="py-1 text-right text-sm font-semibold tabular-nums text-teal-950">
                                {formatMoney(entry.usageTotals.amount)} THB
                              </TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                        <p className="border-t border-teal-900/8 px-4 py-2 text-[11px] text-teal-900/45">
                          Amount = AD × {formatMoney(entry.lot.adultPrice)} + CH ×{' '}
                          {formatMoney(entry.lot.childPrice)} (this lot’s rates). Future tour dates
                          stay under Advance until that day begins (midnight Bangkok) — not deducted
                          while still changeable.
                        </p>
                      </>
                    )}
                  </Surface>
                ))}
              </div>
            )}
          </div>
        </div>

        <Dialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit lot</DialogTitle>
              <DialogDescription>
                Update heads, prices, and note. Existing transfers stay as recorded.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void handleEditSave()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="edit-lot-note">Note</Label>
                <Input
                  id="edit-lot-note"
                  value={editDraft.note}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, note: event.target.value }))
                  }
                  placeholder="e.g. March set"
                  className="h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lot-adult-price">Price / head AD</Label>
                  <Input
                    id="edit-lot-adult-price"
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={editDraft.adultPrice}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, adultPrice: event.target.value }))
                    }
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lot-child-price">Price / head CH</Label>
                  <Input
                    id="edit-lot-child-price"
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={editDraft.childPrice}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, childPrice: event.target.value }))
                    }
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lot-park-fee">Park Fee</Label>
                  <select
                    id="edit-lot-park-fee"
                    value={editDraft.parkFee}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        parkFee: event.target.value as AgentAllotmentParkFee,
                      }))
                    }
                    className={selectClassName}
                  >
                    <option value="inc">Inc</option>
                    <option value="exc">Exc</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-lot-heads">Heads</Label>
                  <Input
                    id="edit-lot-heads"
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={editDraft.heads}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, heads: event.target.value }))
                    }
                    className="h-10"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Lot total</Label>
                <div className="flex h-10 items-center rounded-xl border border-teal-900/10 bg-teal-950/[0.03] px-3 text-sm font-semibold tabular-nums text-teal-950">
                  {formatMoney(draftTotals(editDraft).totalAmount)} THB
                </div>
              </div>
              {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  if (view === 'agent' || (view === 'lot' && !selectedLot)) {
    const agentName =
      selectedAgentSummary?.name ||
      selectedAgentRows[0]?.agentName ||
      agents.find((agent) => agent.slug === selectedAgentSlug)?.name ||
      selectedAgentSlug
    const ledgerTotals = draftTotals(ledgerDraft)
    const lotsNewestFirst = [...selectedAgentRows].reverse()

    return (
      <div className="w-full">
        <PageHeader
          title={agentName || 'Agent Allotment'}
          description="Each tab is one allotment. New bookings wait in Daily checker until Save, then land on the lot marked new. Open a new lot to switch where the next save goes."
          actions={
            <Button type="button" variant="outline" size="sm" onClick={() => setView('add')}>
              <ArrowLeft className="size-3.5" />
              Back
            </Button>
          }
        />

        <div className="mb-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Surface className="px-4 py-3">
            <p className="text-xs text-teal-900/45">หัวเหลือ</p>
            <p
              className={cn(
                'mt-1 text-2xl font-semibold tabular-nums',
                bookHeadsLeft < 0 ? 'text-rose-700' : 'text-teal-800',
              )}
            >
              {bookHeadsLeft}
            </p>
          </Surface>
          <Surface className="px-4 py-3">
            <p className="text-xs text-teal-900/45">ใช้ไป / ซื้อไว้</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-teal-950">
              {fifoUsed}
              <span className="mx-1 text-sm font-normal text-teal-900/35">/</span>
              {fifoPurchased}
            </p>
          </Surface>
          <Surface className="px-4 py-3">
            <p className="text-xs text-teal-900/45">เงินที่รับ</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-teal-950">
              {formatMoney(selectedAgentSummary?.paidAmount ?? 0)}
            </p>
          </Surface>
          <Surface className="px-4 py-3">
            <p className="text-xs text-teal-900/45">เรทปัจจุบัน</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-teal-950">
              {bookRate > 0 ? formatMoney(bookRate) : '—'}
              <span className="ml-1 text-sm font-normal text-teal-900/45">
                {formatAllotmentParkFee(selectedAgentRows.at(-1)?.parkFee ?? 'exc')}
              </span>
            </p>
          </Surface>
        </div>

        <Surface className="mb-4 overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/8 px-4 py-3">
            <div>
              <h2 className="text-sm font-semibold text-teal-950">สมุดรายล็อต</h2>
              <p className="max-w-3xl text-xs text-teal-900/45">
                Click a tab to see that lot, like the sheet: top-ups add heads, saved days deduct them.
                The tab marked new receives the next Daily checker save. Move a saved day if it belongs on another lot.
                {pendingChecker.heads > 0
                  ? ` ${pendingChecker.heads} heads on ${pendingChecker.days} day${pendingChecker.days === 1 ? '' : 's'} are still only in Daily checker.`
                  : ''}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => setShowLots((open) => !open)}>
              {showLots ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              ก้อนโอน {selectedAgentRows.length}
            </Button>
          </div>
          <div
            ref={lotTabStripRef}
            className="flex gap-1.5 overflow-x-auto border-b border-teal-900/8 px-3 py-2"
          >
            <button
              type="button"
              data-lot-tab="book"
              onClick={() => setBookTab('book')}
              className={cn(
                'shrink-0 rounded-xl border px-2.5 py-1.5 text-left',
                bookTab === 'book'
                  ? 'border-teal-800 bg-teal-800 text-white'
                  : 'border-teal-900/10 bg-white text-teal-950',
              )}
            >
              <span className="block text-[11px] font-semibold">รวม</span>
              <span className={cn('block text-[10px] tabular-nums', bookTab === 'book' ? 'text-white/75' : 'text-teal-900/45')}>
                เหลือ {bookHeadsLeft}
              </span>
            </button>
            {lotBooks.map((book) => {
              const selected = bookTab !== 'book' && book.lotId === resolvedLotTabId
              return (
                <button
                  key={book.lotId}
                  type="button"
                  data-lot-tab={book.lotId}
                  onClick={() => setBookTab(book.lotId)}
                  className={cn(
                    'shrink-0 rounded-xl border px-2.5 py-1.5 text-left',
                    selected && 'border-teal-800 bg-teal-800 text-white',
                    !selected && book.status === 'active' && 'border-orange-400 bg-orange-50 text-orange-950',
                    !selected && book.status === 'done' && 'border-teal-900/10 bg-teal-950/[0.03] text-teal-900/70',
                    !selected && book.status === 'waiting' && 'border-teal-900/10 bg-white text-teal-950',
                    !selected && book.status === 'over' && 'border-rose-300 bg-rose-50 text-rose-900',
                  )}
                >
                  <span className="block text-[11px] font-semibold">ล็อต {book.index}</span>
                  <span
                    className={cn(
                      'block text-[10px] tabular-nums',
                      selected ? 'text-white/75' : 'text-teal-900/45',
                      !selected && book.status === 'active' && 'text-orange-800/70',
                      !selected && book.status === 'over' && 'text-rose-800/70',
                    )}
                  >
                    {formatLotTabDate(book.openDate)} · {lotBookStatusLabel(book.status)} {book.remaining}
                    {book.lotId === receivingLotId ? ' · new' : ''}
                  </span>
                </button>
              )
            })}
          </div>
          {bookTab !== 'book' && selectedLotBook ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-teal-900/8 px-4 py-2 text-xs text-teal-900/55">
              <p>
                Opened {formatShortDate(selectedLotBook.openDate)} · {selectedLotBook.seats} heads @{' '}
                {formatMoney(selectedLotBook.rate)} · received {formatMoney(selectedLotBook.paid)} · used{' '}
                {selectedLotBook.used} · left {selectedLotBook.remaining}
                {selectedLotBook.lotId === receivingLotId
                  ? ' · next Daily checker save loads here'
                  : ''}
                {selectedLotBook.lotId === receivingLotId && advanceBookingPreview.heads > 0
                  ? ` · ${advanceBookingPreview.heads} future heads stay in Daily checker until that day is saved`
                  : ''}
              </p>
              {selectedLotBook.lotId === receivingLotId ? null : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void setAgentAllotmentReceiving(selectedAgentSlug, selectedLotBook.lotId)
                      .then(() => refresh())
                      .catch((caught) => {
                        window.alert(caught instanceof Error ? caught.message : 'Could not switch the open lot.')
                      })
                  }}
                >
                  New saves load here
                </Button>
              )}
            </div>
          ) : (
            <p className="border-b border-teal-900/8 px-4 py-2 text-xs text-teal-900/55">
              All lots together. Heads left is the whole account. Open a tab to top up or move a saved day.
            </p>
          )}
          <DepositBookTable
            lines={bookTab === 'book' || !selectedLotBook ? depositBook : selectedLotBook.lines}
            moveTargets={
              selectedLotBook && bookTab !== 'book'
                ? lotBooks
                    .filter((book) => book.lotId !== selectedLotBook.lotId)
                    .map((book) => ({ id: book.lotId, label: `Lot ${book.index}` }))
                : undefined
            }
            onMoveDay={bookTab === 'book' ? undefined : (day, allotmentId) => void moveSavedDay(day, allotmentId)}
          />
          <form
            className="grid gap-2 border-t border-teal-900/8 px-4 py-3 sm:grid-cols-2 lg:grid-cols-5"
            onSubmit={handleTopUpCurrentLot}
          >
            <div className="sm:col-span-2 lg:col-span-5">
              <p className="text-xs font-medium text-teal-950">
                {selectedLotBook && selectedLotBook.remaining <= 0
                  ? `Lot ${selectedLotBook.index} is used up. This transfer opens a new lot, and the next Daily checker save loads there.`
                  : `Top up ${selectedLotBook ? `lot ${selectedLotBook.index}` : 'the open lot'}. Heads and money stay on this lot.`}
              </p>
            </div>
            <Input
              type="date"
              required
              value={topUpDraft.paidDate}
              onChange={(event) =>
                setTopUpDraft((current) => ({ ...current, paidDate: event.target.value }))
              }
              className="h-10"
              aria-label="วันที่โอน"
            />
            <Input
              type="number"
              min={1}
              step={1}
              required
              value={topUpDraft.heads}
              onChange={(event) =>
                setTopUpDraft((current) => ({ ...current, heads: event.target.value }))
              }
              placeholder="หัว"
              className="h-10"
              aria-label="หัวที่โอนเพิ่ม"
            />
            <Input
              type="number"
              min={0}
              step={1}
              required
              value={topUpDraft.amount}
              onChange={(event) =>
                setTopUpDraft((current) => ({ ...current, amount: event.target.value }))
              }
              placeholder="บาท"
              className="h-10"
              aria-label="จำนวนเงิน"
            />
            <Input
              value={topUpDraft.note}
              onChange={(event) =>
                setTopUpDraft((current) => ({ ...current, note: event.target.value }))
              }
              placeholder="เลขอ้างอิง"
              className="h-10"
              aria-label="เลขอ้างอิง"
            />
            <Button type="submit" disabled={savingTopUp} className="h-10">
              {savingTopUp
                ? 'กำลังบันทึก…'
                : selectedLotBook && selectedLotBook.remaining <= 0
                  ? 'Open new lot'
                  : 'Top up'}
            </Button>
            {topUpError ? (
              <p className="text-sm text-red-600 sm:col-span-2 lg:col-span-5">{topUpError}</p>
            ) : null}
          </form>
        </Surface>

        {showLots || selectedAgentRows.length === 0 ? (
        <>
        <Surface className="mb-4 p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <Wallet className="size-4 text-teal-800" />
            <h2 className="text-sm font-semibold text-teal-950">Open new lot</h2>
          </div>
          <form
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8"
            onSubmit={handleLedgerTopUp}
          >
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Lot date</Label>
              <Input
                type="date"
                required
                value={ledgerDraft.paidDate}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, paidDate: event.target.value }))
                }
                className="h-10"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2 xl:col-span-2">
              <Label className="text-xs text-neutral-400">Note</Label>
              <Input
                value={ledgerDraft.note}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, note: event.target.value }))
                }
                placeholder="e.g. March set ~100 heads"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Price AD</Label>
              <Input
                type="number"
                min={0}
                step={1}
                required
                value={ledgerDraft.adultPrice}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, adultPrice: event.target.value }))
                }
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Price CH</Label>
              <Input
                type="number"
                min={0}
                step={1}
                required
                value={ledgerDraft.childPrice}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, childPrice: event.target.value }))
                }
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Park Fee</Label>
              <select
                value={ledgerDraft.parkFee}
                onChange={(event) =>
                  setLedgerDraft((current) => ({
                    ...current,
                    parkFee: event.target.value as AgentAllotmentParkFee,
                  }))
                }
                className={selectClassName}
              >
                <option value="inc">Inc</option>
                <option value="exc">Exc</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Heads</Label>
              <Input
                type="number"
                min={1}
                step={1}
                required
                value={ledgerDraft.heads}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, heads: event.target.value }))
                }
                placeholder="0"
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-neutral-400">Paid now (THB)</Label>
              <Input
                type="number"
                min={0}
                step={1}
                value={ledgerDraft.paidAmount}
                onChange={(event) =>
                  setLedgerDraft((current) => ({ ...current, paidAmount: event.target.value }))
                }
                placeholder="0"
                className="h-10"
              />
            </div>
            <div className="flex items-end sm:col-span-2 xl:col-span-8">
              <div className="flex w-full flex-wrap items-center gap-3">
                <Button type="submit" disabled={savingLedger} className="h-10">
                  <Plus data-icon="inline-start" />
                  {savingLedger ? 'Saving…' : 'Open lot'}
                </Button>
                <p className="text-xs text-teal-900/45">
                  Lot total {formatMoney(ledgerTotals.totalAmount)} THB. Paid now can be partial —
                  add more transfers inside the lot.
                </p>
              </div>
            </div>
          </form>
          {ledgerError ? <p className="mt-3 text-sm text-red-600">{ledgerError}</p> : null}
        </Surface>

        {loadError ? (
          <p className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
            {loadError}
          </p>
        ) : null}

        {loading ? <p className="text-sm text-teal-900/50">Loading lots…</p> : null}

        {!loading && selectedAgentRows.length === 0 ? (
          <Surface className="p-6 text-sm text-teal-900/55">
            No lots yet. Open the first lot above.
          </Surface>
        ) : null}

        {lotsNewestFirst.length > 0 ? (
          <>
            <div className="mb-2">
              <h2 className="text-sm font-semibold text-teal-950">Lots</h2>
              <p className="text-xs text-teal-900/45">
                Click a lot for transfers and head usage. Usage fills oldest lots first.
              </p>
            </div>

            <div className="space-y-2 md:hidden">
              {lotsNewestFirst.map((row) => {
                const usage = selectedAgentUsageByLot.get(row.id)
                const status = allotmentPayStatus(row)
                const date = row.paidDate || row.createdAt.slice(0, 10)
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => openLot(row)}
                    className="w-full rounded-[1.2rem] border border-teal-900/10 bg-white/80 p-4 text-left transition hover:border-teal-600/30 hover:bg-teal-50/40"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-teal-900/45">{formatShortDate(date)}</p>
                        <p className="mt-0.5 font-medium text-teal-950">
                          {row.note.trim() || `${row.seats} Heads`}
                        </p>
                      </div>
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset',
                          payStatusClass(status),
                        )}
                      >
                        {payStatusLabel(status)}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                      <div>
                        <p className="text-teal-900/40">Heads</p>
                        <p className="font-semibold tabular-nums">{row.seats}</p>
                      </div>
                      <div>
                        <p className="text-teal-900/40">Used</p>
                        <p className="font-semibold tabular-nums">{usage?.used ?? 0}</p>
                      </div>
                      <div>
                        <p className="text-teal-900/40">Left</p>
                        <p
                          className={cn(
                            'font-semibold tabular-nums',
                            (usage?.remaining ?? 0) < 0 ? 'text-rose-700' : 'text-teal-800',
                          )}
                        >
                          {usage?.remaining ?? row.seats}
                        </p>
                      </div>
                      <div>
                        <p className="text-teal-900/40">Due</p>
                        <p className="font-semibold tabular-nums text-amber-800">
                          {formatMoney(allotmentBalance(row))}
                        </p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            <Surface className="hidden overflow-x-auto md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="px-4 text-teal-700/45">Opened</TableHead>
                    <TableHead className="text-teal-700/45">Lot</TableHead>
                    <TableHead className="text-right text-teal-700/45">Heads</TableHead>
                    <TableHead className="text-right text-teal-700/45">Used</TableHead>
                    <TableHead className="text-right text-teal-700/45">Left</TableHead>
                    <TableHead className="text-right text-teal-700/45">Paid</TableHead>
                    <TableHead className="text-right text-teal-700/45">Due</TableHead>
                    <TableHead className="text-teal-700/45">Status</TableHead>
                    <TableHead className="text-right text-teal-700/45" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lotsNewestFirst.map((row) => {
                    const usage = selectedAgentUsageByLot.get(row.id)
                    const status = allotmentPayStatus(row)
                    const date = row.paidDate || row.createdAt.slice(0, 10)
                    return (
                      <TableRow
                        key={row.id}
                        className="cursor-pointer"
                        onClick={() => openLot(row)}
                      >
                        <TableCell className="px-4 whitespace-nowrap">
                          {formatShortDate(date)}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium text-teal-950">
                            {row.note.trim() || `${row.seats} Heads`}
                          </p>
                          <p className="text-[11px] text-teal-900/40">
                            AD {formatMoney(row.adultPrice)} · CH {formatMoney(row.childPrice)} ·
                            Park {formatAllotmentParkFee(row.parkFee)}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {row.seats}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {usage?.used ?? 0}
                        </TableCell>
                        <TableCell
                          className={cn(
                            'text-right tabular-nums font-semibold',
                            (usage?.remaining ?? 0) < 0 ? 'text-rose-700' : 'text-teal-800',
                          )}
                        >
                          {usage?.remaining ?? row.seats}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(allotmentPaidTotal(row))}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-amber-800">
                          {formatMoney(allotmentBalance(row))}
                        </TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset',
                              payStatusClass(status),
                            )}
                          >
                            {payStatusLabel(status)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right" onClick={(event) => event.stopPropagation()}>
                          <div className="flex justify-end gap-2">
                            <Button variant="outline" size="sm" onClick={() => openLot(row)}>
                              Open
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                              <Pencil data-icon="inline-start" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              className="text-neutral-400 hover:text-red-600"
                              aria-label="Delete lot"
                              onClick={() => void handleDelete(row)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </Surface>
          </>
        ) : null}
        </>
        ) : null}

        <Dialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit lot</DialogTitle>
              <DialogDescription>
                Update prices, heads, and note. Transfers on this lot are kept.
              </DialogDescription>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault()
                void handleEditSave()
              }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="edit-agent-lot-note">Note</Label>
                <Input
                  id="edit-agent-lot-note"
                  value={editDraft.note}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, note: event.target.value }))
                  }
                  placeholder="e.g. March set"
                  className="h-10"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-agent-lot-adult-price">Price / head AD</Label>
                  <Input
                    id="edit-agent-lot-adult-price"
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={editDraft.adultPrice}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, adultPrice: event.target.value }))
                    }
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-agent-lot-child-price">Price / head CH</Label>
                  <Input
                    id="edit-agent-lot-child-price"
                    type="number"
                    min={0}
                    step={1}
                    required
                    value={editDraft.childPrice}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, childPrice: event.target.value }))
                    }
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-agent-lot-park-fee">Park Fee</Label>
                  <select
                    id="edit-agent-lot-park-fee"
                    value={editDraft.parkFee}
                    onChange={(event) =>
                      setEditDraft((current) => ({
                        ...current,
                        parkFee: event.target.value as AgentAllotmentParkFee,
                      }))
                    }
                    className={selectClassName}
                  >
                    <option value="inc">Inc</option>
                    <option value="exc">Exc</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-agent-lot-heads">Heads</Label>
                  <Input
                    id="edit-agent-lot-heads"
                    type="number"
                    min={1}
                    step={1}
                    required
                    value={editDraft.heads}
                    onChange={(event) =>
                      setEditDraft((current) => ({ ...current, heads: event.target.value }))
                    }
                    className="h-10"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Lot total</Label>
                <div className="flex h-10 items-center rounded-xl border border-teal-900/10 bg-teal-950/[0.03] px-3 text-sm font-semibold tabular-nums text-teal-950">
                  {formatMoney(draftTotals(editDraft).totalAmount)} THB
                </div>
              </div>
              {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={savingEdit}>
                  {savingEdit ? 'Saving…' : 'Save'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  const addTotals = draftTotals(draft)

  return (
    <div className="w-full">
      <PageHeader
        title="Lots & payments"
        description="Open a new lot, or click an agent to manage lots, transfers, and head usage."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={() => setView('hub')}>
            <ArrowLeft className="size-3.5" />
            Back
          </Button>
        }
      />

      <Surface className="p-5">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-9" onSubmit={handleAdd}>
          <div className="space-y-1.5 sm:col-span-2 xl:col-span-2">
            <Label htmlFor="allotment-agent" className="text-xs text-neutral-400">
              Agent
            </Label>
            <select
              id="allotment-agent"
              required
              value={draft.agentSlug}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  agentSlug: event.target.value,
                  newAgentName: event.target.value === NEW_AGENT_VALUE ? current.newAgentName : '',
                }))
                if (addError) setAddError('')
              }}
              className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
            >
              <option value="">Select agent</option>
              <option value={NEW_AGENT_VALUE}>+ Add new agent…</option>
              {agentOptions.map((agent) => (
                <option key={agent.slug} value={agent.slug}>
                  {agent.name}
                </option>
              ))}
            </select>
            {draft.agentSlug === NEW_AGENT_VALUE ? (
              <Input
                id="allotment-new-agent"
                value={draft.newAgentName}
                onChange={(event) => {
                  setDraft((current) => ({ ...current, newAgentName: event.target.value }))
                  if (addError) setAddError('')
                }}
                placeholder="New agent name"
                className="mt-2 h-10"
                required
              />
            ) : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-adult-price" className="text-xs text-neutral-400">
              Price AD
            </Label>
            <Input
              id="allotment-adult-price"
              type="number"
              min={0}
              step={1}
              required
              value={draft.adultPrice}
              onChange={(event) => {
                setDraft((current) => ({ ...current, adultPrice: event.target.value }))
                if (addError) setAddError('')
              }}
              placeholder="0"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-child-price" className="text-xs text-neutral-400">
              Price CH
            </Label>
            <Input
              id="allotment-child-price"
              type="number"
              min={0}
              step={1}
              required
              value={draft.childPrice}
              onChange={(event) => {
                setDraft((current) => ({ ...current, childPrice: event.target.value }))
                if (addError) setAddError('')
              }}
              placeholder="0"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-park-fee" className="text-xs text-neutral-400">
              Park Fee
            </Label>
            <select
              id="allotment-park-fee"
              value={draft.parkFee}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  parkFee: event.target.value as AgentAllotmentParkFee,
                }))
                if (addError) setAddError('')
              }}
              className={selectClassName}
            >
              <option value="inc">Inc</option>
              <option value="exc">Exc</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-heads" className="text-xs text-neutral-400">
              Heads
            </Label>
            <Input
              id="allotment-heads"
              type="number"
              min={1}
              step={1}
              required
              value={draft.heads}
              onChange={(event) => {
                setDraft((current) => ({ ...current, heads: event.target.value }))
                if (addError) setAddError('')
              }}
              placeholder="0"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-neutral-400">Amount</Label>
            <div className="flex h-10 items-center rounded-xl border border-teal-900/10 bg-teal-950/[0.03] px-3 text-sm font-semibold tabular-nums text-teal-950">
              {formatMoney(addTotals.totalAmount)} THB
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-paid-amount" className="text-xs text-neutral-400">
              Paid now
            </Label>
            <Input
              id="allotment-paid-amount"
              type="number"
              min={0}
              step={1}
              value={draft.paidAmount}
              onChange={(event) => {
                setDraft((current) => ({ ...current, paidAmount: event.target.value }))
                if (addError) setAddError('')
              }}
              placeholder="0"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="allotment-paid-date" className="text-xs text-neutral-400">
              Lot date
            </Label>
            <Input
              id="allotment-paid-date"
              type="date"
              required
              value={draft.paidDate}
              onChange={(event) => {
                setDraft((current) => ({ ...current, paidDate: event.target.value }))
                if (addError) setAddError('')
              }}
              className="h-10"
            />
          </div>
          <div className="flex items-end sm:col-span-2 xl:col-span-9">
            <Button type="submit" disabled={adding} className="h-10 w-full sm:w-auto">
              <Plus data-icon="inline-start" />
              {adding ? 'Saving…' : 'Open lot'}
            </Button>
          </div>
        </form>
        <p className="mt-3 text-xs text-teal-900/45">
          Lot total {formatMoney(addTotals.totalAmount)} THB. Paid now can be 0 or partial — add
          more transfers inside the lot afterward.
        </p>
        {addError ? <p className="mt-3 text-sm text-red-600">{addError}</p> : null}
      </Surface>

      {loadError ? (
        <p className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-800">
          {loadError}
        </p>
      ) : null}

      {loading ? <p className="mt-4 text-sm text-teal-900/50">Loading purchases…</p> : null}

      {!loading && agentSummaries.length > 0 ? (
        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-teal-950">Agent</h2>
          <p className="mb-3 text-xs text-teal-900/50">
            Click an agent to open lots, record transfers, and see heads used.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {agentSummaries.map((summary) => {
              const status: AgentAllotmentPayStatus =
                summary.paidAmount <= 0.009
                  ? 'unpaid'
                  : summary.balance <= 0.009
                    ? 'paid'
                    : 'partial'
              return (
                <button
                  key={summary.slug}
                  type="button"
                  onClick={() => openAgent(summary.slug)}
                  className="rounded-[1.2rem] border border-teal-900/10 bg-white/80 px-4 py-3.5 text-left transition hover:border-teal-600/30 hover:bg-teal-50/40 hover:shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-teal-950">{summary.name}</p>
                      <p className="mt-0.5 text-xs text-teal-900/45">
                        {summary.purchases} lots ·{' '}
                        {summary.seats} heads
                      </p>
                    </div>
                    <span
                      className={cn(
                        'inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset',
                        payStatusClass(status),
                      )}
                    >
                      {payStatusLabel(status)}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                    <div>
                      <p className="text-teal-900/40">Paid</p>
                      <p className="font-semibold tabular-nums text-teal-800">
                        {formatMoney(summary.paidAmount)}
                      </p>
                    </div>
                    <div>
                      <p className="text-teal-900/40">Due</p>
                      <p className="font-semibold tabular-nums text-amber-800">
                        {formatMoney(summary.balance)}
                      </p>
                    </div>
                    <div>
                      <p className="text-teal-900/40">Used</p>
                      <p className="font-semibold tabular-nums text-teal-950">{summary.used}</p>
                    </div>
                    <div>
                      <p className="text-teal-900/40">Left</p>
                      <p
                        className={cn(
                          'font-semibold tabular-nums',
                          summary.remaining < 0 ? 'text-rose-700' : 'text-teal-800',
                        )}
                      >
                        {summary.remaining}
                      </p>
                    </div>
                  </div>
                  <p className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold tracking-wide text-teal-800 uppercase">
                    Open lots
                    <ChevronRight className="size-3.5" />
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}

      {!loading && rows.length > 0 ? (
        <div className="mt-5">
          <h2 className="mb-2 text-sm font-semibold text-teal-950">Recent lots</h2>
          <p className="mb-3 text-xs text-teal-900/50">
            Click Open to view transfers and head usage on that lot.
          </p>
          <Surface className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-4 text-teal-700/45">Agent</TableHead>
                  <TableHead className="text-right text-teal-700/45">Price AD</TableHead>
                  <TableHead className="text-right text-teal-700/45">Price CH</TableHead>
                  <TableHead className="text-center text-teal-700/45">Park Fee</TableHead>
                  <TableHead className="text-right text-teal-700/45">Heads</TableHead>
                  <TableHead className="text-right text-teal-700/45">Amount</TableHead>
                  <TableHead className="text-right text-teal-700/45">Paid</TableHead>
                  <TableHead className="text-right text-teal-700/45">Due</TableHead>
                  <TableHead className="text-teal-700/45">Status</TableHead>
                  <TableHead className="text-right text-teal-700/45" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const status = allotmentPayStatus(row)
                  return (
                    <TableRow key={row.id}>
                      <TableCell className="px-4">
                        <button
                          type="button"
                          className="font-medium text-teal-900 underline-offset-2 hover:underline"
                          onClick={() => openAgent(row.agentSlug)}
                        >
                          {row.agentName}
                        </button>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.adultPrice > 0 ? formatMoney(row.adultPrice) : '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.childPrice > 0 ? formatMoney(row.childPrice) : '—'}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {formatAllotmentParkFee(row.parkFee)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {row.seats}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-semibold">
                        {formatMoney(row.totalAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatMoney(allotmentPaidTotal(row))}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-amber-800">
                        {formatMoney(allotmentBalance(row))}
                      </TableCell>
                      <TableCell>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase ring-1 ring-inset',
                            payStatusClass(status),
                          )}
                        >
                          {payStatusLabel(status)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" size="sm" onClick={() => openLot(row)}>
                            Open
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => openEdit(row)}>
                            <Pencil data-icon="inline-start" />
                            Edit
                          </Button>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            className="text-neutral-400 hover:text-red-600"
                            aria-label={`Remove this lot for ${row.agentName}`}
                            onClick={() => void handleDelete(row)}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Surface>
        </div>
      ) : null}

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit lot</DialogTitle>
              <DialogDescription>
                Update agent, AD/CH prices and heads. Existing transfers stay as recorded.
              </DialogDescription>
            </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault()
              void handleEditSave()
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="edit-allotment-agent">Agent</Label>
              <select
                id="edit-allotment-agent"
                required
                value={editDraft.agentSlug}
                onChange={(event) =>
                  setEditDraft((current) => ({
                    ...current,
                    agentSlug: event.target.value,
                    newAgentName: event.target.value === NEW_AGENT_VALUE ? current.newAgentName : '',
                  }))
                }
                className="h-10 w-full rounded-xl border border-teal-900/12 bg-white/80 px-3 text-sm outline-none focus-visible:border-teal-700/40 focus-visible:ring-3 focus-visible:ring-teal-700/15"
              >
                <option value="">Select agent</option>
                <option value={NEW_AGENT_VALUE}>+ Add new agent…</option>
                {agentOptions.map((agent) => (
                  <option key={agent.slug} value={agent.slug}>
                    {agent.name}
                  </option>
                ))}
              </select>
              {editDraft.agentSlug === NEW_AGENT_VALUE ? (
                <Input
                  id="edit-allotment-new-agent"
                  value={editDraft.newAgentName}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, newAgentName: event.target.value }))
                  }
                  placeholder="New agent name"
                  className="mt-2 h-10"
                  required
                />
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="edit-allotment-adult-price">Price / head AD</Label>
                <Input
                  id="edit-allotment-adult-price"
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={editDraft.adultPrice}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, adultPrice: event.target.value }))
                  }
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-allotment-child-price">Price / head CH</Label>
                <Input
                  id="edit-allotment-child-price"
                  type="number"
                  min={0}
                  step={1}
                  required
                  value={editDraft.childPrice}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, childPrice: event.target.value }))
                  }
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-allotment-park-fee">Park Fee</Label>
                <select
                  id="edit-allotment-park-fee"
                  value={editDraft.parkFee}
                  onChange={(event) =>
                    setEditDraft((current) => ({
                      ...current,
                      parkFee: event.target.value as AgentAllotmentParkFee,
                    }))
                  }
                  className={selectClassName}
                >
                  <option value="inc">Inc</option>
                  <option value="exc">Exc</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="edit-allotment-heads">Heads (AD + CH pool)</Label>
                <Input
                  id="edit-allotment-heads"
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={editDraft.heads}
                  onChange={(event) =>
                    setEditDraft((current) => ({ ...current, heads: event.target.value }))
                  }
                  className="h-10"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Total amount</Label>
              <div className="flex h-10 items-center rounded-xl border border-teal-900/10 bg-teal-950/[0.03] px-3 text-sm font-semibold tabular-nums text-teal-950">
                {formatMoney(draftTotals(editDraft).totalAmount)} THB
              </div>
              <p className="text-xs text-teal-900/45">
                Heads × AD price. AD and CH bookings share this head pool.
              </p>
            </div>
            {editError ? <p className="text-sm text-red-600">{editError}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingEdit}>
                {savingEdit ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type CardTone = 'teal' | 'amber' | 'sky'

const CARD_TONES: Record<
  CardTone,
  {
    card: string
    icon: string
    meta: string
    title: string
    body: string
    cta: string
    wash: string
  }
> = {
  teal: {
    card: 'border-teal-900/10 bg-gradient-to-br from-teal-50/90 via-white to-cyan-50/40 hover:border-teal-600/30 hover:shadow-lg hover:shadow-teal-900/8',
    icon: 'bg-gradient-to-br from-teal-600 to-cyan-700 text-white shadow-md shadow-teal-700/25',
    meta: 'bg-teal-950/6 text-teal-800',
    title: 'text-teal-950',
    body: 'text-teal-900/55',
    cta: 'text-teal-800',
    wash: 'from-teal-500/10 via-transparent to-transparent',
  },
  amber: {
    card: 'border-amber-900/10 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/35 hover:border-amber-600/30 hover:shadow-lg hover:shadow-amber-900/8',
    icon: 'bg-gradient-to-br from-amber-500 to-orange-700 text-white shadow-md shadow-amber-700/25',
    meta: 'bg-amber-950/6 text-amber-900',
    title: 'text-amber-950',
    body: 'text-amber-950/55',
    cta: 'text-amber-800',
    wash: 'from-amber-500/12 via-transparent to-transparent',
  },
  sky: {
    card: 'border-sky-900/10 bg-gradient-to-br from-sky-50/95 via-white to-blue-50/40 hover:border-sky-600/30 hover:shadow-lg hover:shadow-sky-900/8',
    icon: 'bg-gradient-to-br from-sky-500 to-blue-700 text-white shadow-md shadow-sky-700/25',
    meta: 'bg-sky-950/6 text-sky-900',
    title: 'text-sky-950',
    body: 'text-sky-950/55',
    cta: 'text-sky-800',
    wash: 'from-sky-500/12 via-transparent to-transparent',
  },
}

function AllotmentModeCard({
  tone,
  title,
  subtitle,
  meta,
  icon,
  onClick,
}: {
  tone: CardTone
  title: string
  subtitle: string
  meta: string
  icon: ReactNode
  onClick: () => void
}) {
  const styles = CARD_TONES[tone]
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative overflow-hidden rounded-[1.35rem] border p-5 text-left transition-all sm:p-6',
        styles.card,
      )}
    >
      <div
        className={cn(
          'pointer-events-none absolute inset-0 bg-gradient-to-br opacity-80',
          styles.wash,
        )}
      />
      <div className="relative flex items-start gap-4">
        <span
          className={cn(
            'inline-flex size-12 shrink-0 items-center justify-center rounded-2xl',
            styles.icon,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <span
            className={cn(
              'inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
              styles.meta,
            )}
          >
            {meta}
          </span>
          <h2 className={cn('mt-2 text-lg font-semibold tracking-tight', styles.title)}>{title}</h2>
          <p className={cn('mt-1.5 text-sm leading-relaxed', styles.body)}>{subtitle}</p>
          <p className={cn('mt-4 text-xs font-semibold tracking-wide uppercase', styles.cta)}>
            Open →
          </p>
        </div>
      </div>
    </button>
  )
}
