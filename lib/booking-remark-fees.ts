import type { IncludeOption } from '@/lib/types'

/** Remark / note text → national park included or not (Good Day pickup lists, imports). */
export function parkExcludedFromRemark(remark: string) {
  const text = remark.trim()
  if (!text) return false
  if (/^\s*exc\.?\s*$/i.test(text)) return true
  if (/^\s*excl\.?\s*$/i.test(text)) return true
  if (/excl(?:u(?:d(?:ing|ed)?|de|c)?)?(?:\s*national)?(?:\s*park)?/i.test(text)) return true
  if (/\bexc\b[\s.]*npf|exc\s*npf|npf\s*excl/i.test(text)) return true
  if (/national\s*park/i.test(text) && /\bexc\b|exclu|not\s*incl/i.test(text)) return true
  return false
}

export function parkIncludedFromRemark(remark: string) {
  const text = remark.trim()
  if (/^\s*inc\.?\s*$/i.test(text)) return true
  return /inc(?:luding)?\s*npf|inc\s*npf|including national/i.test(text)
}

/** When spreadsheet has no Park column, infer from Remark / note. */
export function inferParkFeeFromRemark(
  note: string,
  explicitPark: unknown,
): IncludeOption | null {
  if (asString(explicitPark)) return null
  if (!note.trim()) return null
  if (parkExcludedFromRemark(note) && !parkIncludedFromRemark(note)) return 'Not Included'
  if (parkIncludedFromRemark(note)) return 'Included'
  return null
}

function asString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}
