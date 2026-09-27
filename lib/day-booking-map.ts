import { dayBoatPlanKey, type Program } from '@/lib/types'

/** date|program → booking code → value */
export type DayBookingMap<T> = Record<string, Record<string, T>>

export function moveDayBookingEntry<T>(
  map: DayBookingMap<T>,
  oldDate: string,
  newDate: string,
  program: Program,
  bookingCode: string,
): DayBookingMap<T> {
  if (oldDate === newDate) return map
  const fromKey = dayBoatPlanKey(oldDate, program)
  const toKey = dayBoatPlanKey(newDate, program)
  const value = map[fromKey]?.[bookingCode]
  if (value === undefined) return map

  const fromDay = { ...(map[fromKey] ?? {}) }
  delete fromDay[bookingCode]
  const toDay = { ...(map[toKey] ?? {}), [bookingCode]: value }
  const next = { ...map }
  if (Object.keys(fromDay).length === 0) delete next[fromKey]
  else next[fromKey] = fromDay
  next[toKey] = toDay
  return next
}
