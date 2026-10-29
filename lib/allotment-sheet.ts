import {
  allotmentPaidTotal,
  allotmentPayments,
  type AgentAllotment,
} from '@/lib/supabase/agent-allotment-db'
import { NO_TRANSFER_DISCOUNT_PER_PERSON } from '@/lib/invoice'
import type { AgentAllotmentDaily, AgentBookingDayPax } from '@/lib/supabase/agent-allotment-daily-db'

export type LotTransfer = {
  id: string
  date: string
  heads: number
  amount: number
  note: string
}

/** Cash and head movements stored on one allotment record. */
export function lotTransfers(lot: AgentAllotment): LotTransfer[] {
  const payments = allotmentPayments(lot)
  const date = (lot.paidDate || lot.createdAt).slice(0, 10)
  const paid = allotmentPaidTotal(lot)
  const headPayments = payments.filter((payment) => !payment.moneyOnly)
  const moneyLines = payments
    .filter((payment) => payment.moneyOnly)
    .map((payment) => ({
      id: payment.id,
      date: (payment.headsDate || payment.paidDate).slice(0, 10),
      heads: 0,
      amount: payment.amount,
      note: payment.note.replace(/^Ref\s*/i, '').trim(),
    }))
  const lump: LotTransfer = {
    id: lot.id,
    date,
    heads: lot.seats,
    amount: paid,
    note: headPayments
      .map((payment) => payment.note.replace(/^Ref\s*/i, '').trim())
      .filter(Boolean)
      .join(', '),
  }
  if (headPayments.length === 0) return [lump, ...moneyLines]
  const explicit = headPayments.filter((payment) => (payment.heads ?? 0) !== 0)
  if (explicit.length === 0) return [lump, ...moneyLines]
  const known = explicit.reduce((sum, payment) => sum + (payment.heads ?? 0), 0)
  const missing = headPayments.filter((payment) => (payment.heads ?? 0) === 0)
  const shares = new Map<string, number>()
  let leftover = lot.seats - known
  if (missing.length > 0 && leftover > 0) {
    const base = Math.floor(leftover / missing.length)
    let extra = leftover - base * missing.length
    for (const payment of missing) {
      const share = base + (extra > 0 ? 1 : 0)
      if (extra > 0) extra -= 1
      shares.set(payment.id, share)
    }
  }
  const headLines = headPayments.map((payment) => {
    const noted = payment.note.replace(/^Ref\s*/i, '').trim()
    const stored = payment.heads ?? 0
    return {
      id: payment.id,
      date: (payment.headsDate || payment.paidDate).slice(0, 10),
      heads: stored !== 0 ? stored : (shares.get(payment.id) ?? 0),
      amount: payment.amount,
      note: noted,
    }
  })
  const assigned = headLines.reduce((sum, line) => sum + line.heads, 0)
  const remainder = lot.seats - assigned
  const opening =
    remainder === 0
      ? []
      : [
          {
            id: `${lot.id}-opening`,
            date,
            heads: remainder,
            amount: 0,
            note: '',
          },
        ]
  return [...opening, ...headLines, ...moneyLines]
}

export type AllotmentSheetBooking = {
  code: string
  agentRef: string
  guestName: string
  hotel: string
  adults: number
  children: number
  chargedCancel?: boolean
  dateChanged?: boolean
  noTransfer?: boolean
  /** Arrived, Cancelled, or Change Date. Empty when none of those apply. */
  status?: string
}

export type AllotmentSheetLine = {
  key: string
  date: string
  kind: 'manual' | 'usage' | 'refund'
  note: string
  /** Bookings on a usage day. Empty on manual rows. */
  bookings: AllotmentSheetBooking[]
  headsDelta: number
  /** Cash on this row. Usage rows charge the day's heads. Refund rows add the No Transfer credit back. */
  moneyDelta: number | null
  /** Positive head value at that day's adult and child rates. Usage rows deduct this from money left. */
  value: number | null
  headsLeft: number
  moneyLeft: number
  /** False for future days that are not saved onto the account yet. */
  counted: boolean
  /** Usage taken from live bookings before Daily checker save. */
  pending: boolean
  lotId: string | null
  paymentId: string | null
}

function lotOpen(lot: AgentAllotment) {
  return (lot.paidDate || lot.createdAt).slice(0, 10)
}

function sortLots(lots: AgentAllotment[]) {
  return [...lots].sort((a, b) => {
    return lotOpen(a).localeCompare(lotOpen(b)) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  })
}

/** Charge used heads at the day's adult and child rates. Unknown mix is priced as adults. */
function usageCharge(
  heads: number,
  adults: number,
  children: number,
  adultPrice: number,
  childPrice: number,
) {
  const used = Math.max(0, Math.floor(heads))
  if (used <= 0) return 0
  const dayTotal = Math.max(0, adults) + Math.max(0, children)
  let adultHeads = used
  let childHeads = 0
  if (dayTotal > 0) {
    adultHeads = Math.round((Math.max(0, adults) * used) / dayTotal)
    adultHeads = Math.min(used, Math.max(0, adultHeads))
    childHeads = used - adultHeads
  }
  return Math.round(adultHeads * adultPrice + childHeads * childPrice)
}

/** 100 THB back to the agent account for each adult and child with no transfer. */
function noTransferCredit(bookings: { noTransfer?: boolean; adults: number; children: number }[]) {
  return bookings.reduce((sum, booking) => {
    if (!booking.noTransfer) return sum
    const people = Math.max(0, booking.adults) + Math.max(0, booking.children)
    return sum + people * NO_TRANSFER_DISCOUNT_PER_PERSON
  }, 0)
}

function cleanNote(value: string) {
  const note = value.replace(/^BW ledger:\s*/i, '').trim()
  if (!note || /^bw ledger$/i.test(note)) return ''
  return note
}

/**
 * One running account, oldest row first.
 * Manual rows are transfers and adjustments. Usage rows are each day's heads.
 */
export function buildAllotmentSheet(input: {
  lots: AgentAllotment[]
  daily: AgentAllotmentDaily[]
  bookings: AgentBookingDayPax[]
  today: string
}): AllotmentSheetLine[] {
  const lots = sortLots(input.lots)
  if (lots.length === 0) return []
  const earliest = lotOpen(lots[0]!)
  const ratesOn = (day: string) => {
    const open = lots.filter((lot) => lotOpen(lot) <= day)
    const lot = open.at(-1) ?? lots.at(-1)
    return {
      adult: Math.max(0, lot?.adultPrice ?? 0),
      child: Math.max(0, lot?.childPrice ?? 0),
    }
  }

  type Event = Omit<AllotmentSheetLine, 'headsLeft' | 'moneyLeft'> & { sort: string }
  const events: Event[] = []
  let seq = 0
  for (const lot of lots) {
    for (const transfer of lotTransfers(lot)) {
      if (transfer.heads === 0 && transfer.amount === 0) continue
      events.push({
        key: `manual-${lot.id}-${transfer.id}`,
        date: transfer.date,
        sort: `0-${String(seq).padStart(5, '0')}`,
        kind: 'manual',
        note: transfer.note,
        bookings: [],
        headsDelta: transfer.heads,
        moneyDelta: transfer.amount,
        value: null,
        counted: true,
        pending: false,
        lotId: lot.id,
        paymentId: transfer.id.endsWith('-opening') ? null : transfer.id,
      })
      seq += 1
    }
  }

  const savedByDay = new Map<string, AgentAllotmentDaily>()
  for (const row of input.daily) {
    if (row.day < earliest) continue
    savedByDay.set(row.day, row)
  }
  const bookingByDay = new Map(input.bookings.map((row) => [row.day, row]))
  const days = new Set<string>([...savedByDay.keys(), ...bookingByDay.keys()])
  for (const day of days) {
    if (day < earliest) continue
    const saved = savedByDay.get(day)
    const booking = bookingByDay.get(day)
    const savedHeads = Math.max(0, saved?.totalDeduct ?? 0)
    const bookingHeads = Math.max(0, booking?.totalDeduct ?? 0)
    // A saved 0 must not hide live bookings. Charged cancels are already inside bookingHeads.
    if (savedHeads <= 0 && bookingHeads <= 0) continue
    const pending = !saved
    // A saved daily total can be only part of the day (one invoice). Every booking on the day is still used.
    const heads = Math.max(savedHeads, bookingHeads)
    if (heads <= 0) continue
    const counted = saved ? Boolean(saved.allotmentId) || day <= input.today : day <= input.today
    const mix =
      booking && (pending || booking.totalDeduct === heads)
        ? `${booking.adults}A+${booking.children}C`
        : ''
    const note = [mix, saved ? cleanNote(saved.note) : ''].filter(Boolean).join(' · ')
    const rates = ratesOn(day)
    const value = usageCharge(heads, booking?.adults ?? 0, booking?.children ?? 0, rates.adult, rates.child)
    const bookings = (booking?.bookings ?? []).map((item) => ({
      code: item.code,
      agentRef: item.agentRef,
      guestName: item.guestName,
      hotel: item.hotel,
      adults: item.adults,
      children: item.children,
      chargedCancel: item.chargedCancel,
      dateChanged: item.dateChanged,
      noTransfer: item.noTransfer,
    }))
    events.push({
      key: `usage-${day}`,
      date: day,
      sort: `2-${day}`,
      kind: 'usage',
      note,
      bookings,
      headsDelta: -heads,
      moneyDelta: value === 0 ? null : -value,
      value: value === 0 ? null : value,
      counted,
      pending,
      lotId: null,
      paymentId: null,
    })
    const credit = noTransferCredit(bookings)
    if (credit > 0) {
      events.push({
        key: `notf-${day}`,
        date: day,
        sort: `1-${day}`,
        kind: 'refund',
        note: 'No transfer refund',
        bookings: [],
        headsDelta: 0,
        moneyDelta: credit,
        value: null,
        counted,
        pending: false,
        lotId: null,
        paymentId: null,
      })
    }
  }

  events.sort((a, b) => a.date.localeCompare(b.date) || a.sort.localeCompare(b.sort))

  let headsLeft = 0
  let moneyLeft = 0
  return events.map((event) => {
    if (event.counted) {
      headsLeft += event.headsDelta
      if (event.moneyDelta != null) moneyLeft += event.moneyDelta
    }
    return {
      key: event.key,
      date: event.date,
      kind: event.kind,
      note: event.note,
      bookings: event.bookings,
      headsDelta: event.headsDelta,
      moneyDelta: event.moneyDelta,
      value: event.value,
      headsLeft,
      moneyLeft,
      counted: event.counted,
      pending: event.pending,
      lotId: event.lotId,
      paymentId: event.paymentId,
    }
  })
}

export function allotmentSheetTotals(lines: AllotmentSheetLine[]) {
  const counted = lines.filter((line) => line.counted)
  const last = counted.at(-1)
  return {
    purchased: counted
      .filter((line) => line.kind === 'manual')
      .reduce((sum, line) => sum + line.headsDelta, 0),
    used: counted
      .filter((line) => line.kind === 'usage')
      .reduce((sum, line) => sum + -line.headsDelta, 0),
    headsLeft: last?.headsLeft ?? 0,
    moneyLeft: last?.moneyLeft ?? 0,
    pendingHeads: lines
      .filter((line) => line.pending && line.counted)
      .reduce((sum, line) => sum + -line.headsDelta, 0),
  }
}
