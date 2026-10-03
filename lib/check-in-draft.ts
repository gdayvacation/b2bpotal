import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'
import type { Program } from '@/lib/types'

export type CheckInDraftGuest = {
  firstName: string
  lastName: string
  nationality: string
  birthday: string
  passportNumber: string
}

export type CheckInDraft = {
  scope: 'one' | 'group' | 'guide'
  guests: CheckInDraftGuest[]
}

function asDraft(value: unknown): CheckInDraft | null {
  if (!value || typeof value !== 'object') return null
  const row = value as { scope?: unknown; guests?: unknown }
  if (!Array.isArray(row.guests)) return null
  const scope = row.scope === 'one' || row.scope === 'guide' || row.scope === 'group' ? row.scope : 'group'
  const guests = row.guests.flatMap((item) => {
    if (!item || typeof item !== 'object') return []
    const guest = item as Record<string, unknown>
    const firstName = String(guest.firstName ?? guest.first_name ?? '').trim()
    const lastName = String(guest.lastName ?? guest.last_name ?? '').trim()
    if (!firstName && !lastName) return []
    return [
      {
        firstName,
        lastName,
        nationality: String(guest.nationality ?? '').trim(),
        birthday: String(guest.birthday ?? '').trim(),
        passportNumber: String(guest.passportNumber ?? guest.passport_number ?? '').trim(),
      },
    ]
  })
  if (guests.length === 0) return null
  return { scope, guests }
}

/** Store typed names even when the phone cannot finish check-in. Uses the QR, not the broken login. */
export async function saveCheckInDraft(input: {
  code: string
  token: string
  date: string
  program: Program
  scope: CheckInDraft['scope']
  guests: CheckInDraftGuest[]
}): Promise<boolean> {
  if (!input.code.trim() || input.guests.length === 0) return false
  try {
    const response = await fetch('/api/check-in/guest/draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: input.code,
        token: input.token,
        date: input.date,
        program: input.program,
        scope: input.scope,
        guests: input.guests,
      }),
    })
    return response.ok
  } catch {
    return false
  }
}

export async function loadCheckInDraft(code: string): Promise<CheckInDraft | null> {
  if (!code.trim() || !hasSupabaseConfig()) return null
  const { data, error } = await getSupabaseBrowserClient().rpc('portal_load_check_in_draft', {
    p_code: code,
  })
  if (error) return null
  return asDraft(data)
}

export async function clearCheckInDraft(code: string): Promise<void> {
  if (!code.trim() || !hasSupabaseConfig()) return
  await getSupabaseBrowserClient().rpc('portal_clear_check_in_draft', { p_code: code })
}
