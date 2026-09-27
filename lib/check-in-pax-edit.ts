import { formatGuestPaxParts, type BookedPaxSnapshot } from '@/lib/check-in-booked-pax'
import { parkFeeRates, parkFeeTotalWithThai } from '@/lib/format'
import {
  invoicesForBookings,
  itemsAgentTotal,
  type InvoiceDocument,
  type InvoiceItem,
} from '@/lib/invoice'
import { loadInvoiceStore, saveInvoiceDocuments } from '@/lib/supabase/invoice-db'
import type { Booking } from '@/lib/types'

export function bookingPaxSnapshot(
  booking: Pick<Booking, 'adults' | 'children' | 'infants' | 'tourLeaders'>,
): BookedPaxSnapshot {
  return {
    adults: booking.adults,
    children: booking.children,
    infants: booking.infants,
    tourLeaders: booking.tourLeaders,
  }
}

export function paxSnapshotsEqual(a: BookedPaxSnapshot, b: BookedPaxSnapshot) {
  return (
    a.adults === b.adults &&
    a.children === b.children &&
    a.infants === b.infants &&
    a.tourLeaders === b.tourLeaders
  )
}

export function appendRemark(existing: string, line: string) {
  const note = existing.trim()
  const add = line.trim()
  if (!add) return note
  if (note.includes(add)) return note
  return [note, add].filter(Boolean).join(' · ')
}

export function formatPaxChangeRemark(from: BookedPaxSnapshot, to: BookedPaxSnapshot, reason: string) {
  const why = reason.trim()
  const change = `${formatGuestPaxParts(from)} → ${formatGuestPaxParts(to)}`
  return why ? `${change} · ${why}` : change
}

function snapshotAmount(item: Pick<InvoiceItem, 'adultPrice' | 'childPrice' | 'infantPrice' | 'tourLeaderPrice'>, pax: BookedPaxSnapshot) {
  return (
    pax.adults * (Number(item.adultPrice) || 0) +
    pax.children * (Number(item.childPrice) || 0) +
    pax.infants * (Number(item.infantPrice) || 0) +
    pax.tourLeaders * (Number(item.tourLeaderPrice) || 0)
  )
}

function updateDeductHeads(description: string, pax: BookedPaxSnapshot) {
  const heads = Math.max(0, pax.adults) + Math.max(0, pax.children)
  return description.replace(/deduct \d+ heads?/i, `deduct ${heads} head${heads === 1 ? '' : 's'}`)
}

function applyPaxToItem(
  item: InvoiceItem,
  booking: Booking,
  pax: BookedPaxSnapshot,
  thaiGuests: number,
): InvoiceItem | null {
  if (item.lineKind === 'no_show') return null

  if (item.lineKind === 'tour') {
    const computed = snapshotAmount(item, pax)
    const hasUnitPrices =
      (Number(item.adultPrice) || 0) > 0 ||
      (Number(item.childPrice) || 0) > 0 ||
      (Number(item.infantPrice) || 0) > 0 ||
      (Number(item.tourLeaderPrice) || 0) > 0
    return {
      ...item,
      adults: pax.adults,
      children: pax.children,
      infants: pax.infants,
      tourLeaders: pax.tourLeaders,
      description: updateDeductHeads(item.description, pax),
      amount: hasUnitPrices ? computed : item.amount,
    }
  }

  if (item.lineKind === 'park_fee' && booking.program === 'PP' && booking.parkFee === 'Included') {
    const rates = parkFeeRates('PP')
    const park = parkFeeTotalWithThai('Not Included', 'PP', pax.adults, pax.children, thaiGuests)
    if (park.foreignAdults + park.foreignChildren <= 0) return null
    return {
      ...item,
      adults: park.foreignAdults,
      children: park.foreignChildren,
      infants: 0,
      tourLeaders: 0,
      adultPrice: rates.adult,
      childPrice: rates.child,
      amount: park.foreignAdults * rates.adult + park.foreignChildren * rates.child,
    }
  }

  if (item.lineKind === 'park_guest') {
    return {
      ...item,
      adults: pax.adults,
      children: pax.children,
    }
  }

  return item
}

export function applyPaxChangeToInvoice(
  doc: InvoiceDocument,
  booking: Booking,
  pax: BookedPaxSnapshot,
  remark: string,
  thaiGuests = 0,
): InvoiceDocument {
  const items = doc.items
    .map((item) => {
      if (item.bookingCode !== booking.code) return item
      return applyPaxToItem(item, booking, pax, thaiGuests)
    })
    .filter((item): item is InvoiceItem => item != null)
    .map((item, index) => ({ ...item, sortOrder: index }))

  return {
    ...doc,
    items,
    notes: appendRemark(doc.notes, remark),
    grandTotal: itemsAgentTotal(items),
  }
}

export function bookingNotesForInvoice(bookings: Booking[]) {
  return [...new Set(bookings.map((booking) => booking.note.trim()).filter(Boolean))].join('\n')
}

export async function syncPaxChangeToInvoices(
  booking: Booking,
  pax: BookedPaxSnapshot,
  remark: string,
  thaiGuests = 0,
) {
  const store = await loadInvoiceStore()
  const linked = invoicesForBookings(store.invoices, [booking.code])
  if (linked.length === 0) return { updated: 0 }
  const updated = linked.map((doc) => applyPaxChangeToInvoice(doc, booking, pax, remark, thaiGuests))
  const result = await saveInvoiceDocuments(updated)
  if (result.error) throw new Error(result.error)
  return { updated: updated.length }
}
