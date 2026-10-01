/**
 * FIFO head usage across agent allotment lots (oldest lot first by business open date).
 * Overage beyond total purchased is applied to the newest eligible lot (remaining can go negative).
 * Pure helpers — safe for UI/report use; does not write to the database.
 */

export type LotFifoInput = {
  id: string
  seats: number
  /**
   * Business open key for FIFO order — prefer lot/paid date (YYYY-MM-DD),
   * not DB createdAt alone (backfilled history would otherwise sort wrong).
   */
  openedAt: string
  /** Tie-break when openedAt matches (ISO timestamp). */
  createdAt?: string
}

export type LotUsageSummary = {
  allotmentId: string
  purchased: number
  used: number
  /** purchased − used; negative when this lot absorbed overage */
  remaining: number
}

export type LotDayUsage = {
  day: string
  heads: number
}

/** Normalize to YYYY-MM-DD for comparisons. */
export function lotOpenDate(lot: Pick<LotFifoInput, 'openedAt'>) {
  return String(lot.openedAt || '').slice(0, 10)
}

export function sortLotsFifo<T extends LotFifoInput>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    const aOpen = lotOpenDate(a)
    const bOpen = lotOpenDate(b)
    return (
      aOpen.localeCompare(bOpen) ||
      String(a.createdAt || '').localeCompare(String(b.createdAt || '')) ||
      a.id.localeCompare(b.id)
    )
  })
}

function purchasedSeats(lot: LotFifoInput) {
  return Math.max(0, Math.floor(Number(lot.seats) || 0))
}

/** Allocate a total deducted head count across lots (oldest first). */
export function allocateHeadsFifo(lots: LotFifoInput[], totalUsed: number): LotUsageSummary[] {
  const ordered = sortLotsFifo(lots)
  let remaining = Math.max(0, Math.floor(Number(totalUsed) || 0))
  const result: LotUsageSummary[] = ordered.map((lot) => {
    const purchased = purchasedSeats(lot)
    if (remaining <= 0) {
      return { allotmentId: lot.id, purchased, used: 0, remaining: purchased }
    }
    if (remaining <= purchased) {
      const used = remaining
      remaining = 0
      return { allotmentId: lot.id, purchased, used, remaining: purchased - used }
    }
    remaining -= purchased
    return { allotmentId: lot.id, purchased, used: purchased, remaining: 0 }
  })

  if (remaining > 0 && result.length > 0) {
    const last = result[result.length - 1]!
    last.used += remaining
    last.remaining = last.purchased - last.used
  }

  return result
}

/**
 * Day-by-day FIFO allocation.
 * Only lots already open on that tour date (openedAt ≤ day) receive usage;
 * among those, older lots fill first and the newest open lot absorbs overage.
 */
export function allocateDailyHeadsFifo(
  lots: LotFifoInput[],
  daily: { day: string; totalDeduct: number }[],
): { summaries: LotUsageSummary[]; byLotId: Map<string, LotDayUsage[]> } {
  const ordered = sortLotsFifo(lots)
  const capacity = new Map(ordered.map((lot) => [lot.id, purchasedSeats(lot)]))
  const usedTotal = new Map(ordered.map((lot) => [lot.id, 0]))
  const byLotId = new Map<string, LotDayUsage[]>(ordered.map((lot) => [lot.id, []]))

  const days = [...daily].sort((a, b) => a.day.localeCompare(b.day))
  for (const row of days) {
    let need = Math.max(0, Math.floor(Number(row.totalDeduct) || 0))
    if (need <= 0) continue

    let eligible = ordered.filter((lot) => lotOpenDate(lot) <= row.day)
    // Usage before any lot open date → apply to earliest lot (backfill-friendly).
    if (eligible.length === 0 && ordered.length > 0) {
      eligible = [ordered[0]!]
    }

    for (let index = 0; index < eligible.length && need > 0; index += 1) {
      const lot = eligible[index]!
      const isNewestOpen = index === eligible.length - 1
      const cap = capacity.get(lot.id) ?? 0
      const take = isNewestOpen ? need : Math.min(need, Math.max(0, cap))
      if (take <= 0) continue

      capacity.set(lot.id, cap - take)
      usedTotal.set(lot.id, (usedTotal.get(lot.id) ?? 0) + take)
      const list = byLotId.get(lot.id) ?? []
      const existing = list.find((item) => item.day === row.day)
      if (existing) existing.heads += take
      else list.push({ day: row.day, heads: take })
      byLotId.set(lot.id, list)
      need -= take
    }
  }

  const summaries: LotUsageSummary[] = ordered.map((lot) => {
    const purchased = purchasedSeats(lot)
    const used = usedTotal.get(lot.id) ?? 0
    return {
      allotmentId: lot.id,
      purchased,
      used,
      remaining: purchased - used,
    }
  })

  return { summaries, byLotId }
}

export function lotUsageMap(summaries: LotUsageSummary[]) {
  return new Map(summaries.map((row) => [row.allotmentId, row]))
}
