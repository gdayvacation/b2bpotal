import { createClient } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { rpcMessage } from '@/lib/rpc-error'

const WINDOW_MS = 60_000
const IP_MAX = 40
const CODE_MAX = 20

const ipHits = new Map<string, { n: number; resetAt: number }>()
const codeHits = new Map<string, { n: number; resetAt: number }>()

function hit(map: Map<string, { n: number; resetAt: number }>, key: string, max: number) {
  const now = Date.now()
  const current = map.get(key)
  if (!current || now > current.resetAt) {
    map.set(key, { n: 1, resetAt: now + WINDOW_MS })
    return false
  }
  current.n += 1
  return current.n > max
}

function text(value: unknown, max: number) {
  return String(value ?? '').trim().slice(0, max)
}

export async function POST(request: NextRequest) {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('x-real-ip')?.trim() ??
    'unknown'
  if (hit(ipHits, ip, IP_MAX)) {
    return NextResponse.json({ error: 'Please wait a moment and try again.' }, { status: 429 })
  }

  const body = (await request.json().catch(() => null)) as {
    code?: unknown
    token?: unknown
    date?: unknown
    program?: unknown
    scope?: unknown
    guests?: unknown
  } | null
  const code = text(body?.code, 40)
  const token = text(body?.token, 200)
  const date = text(body?.date, 10)
  const program = text(body?.program, 20)
  const scope = text(body?.scope, 20)
  if (!code || !/^\d{4}-\d{2}-\d{2}$/.test(date) || (program !== 'PP' && program !== 'James Bond')) {
    return NextResponse.json({ error: 'This check-in QR is not valid.' }, { status: 400 })
  }
  if (hit(codeHits, code, CODE_MAX)) {
    return NextResponse.json({ error: 'Please wait a moment and try again.' }, { status: 429 })
  }
  if (!Array.isArray(body?.guests) || body.guests.length === 0 || body.guests.length > 200) {
    return NextResponse.json({ error: 'Add at least one guest.' }, { status: 400 })
  }

  const guests = body.guests.map((item) => {
    const guest = item && typeof item === 'object' ? (item as Record<string, unknown>) : {}
    return {
      firstName: text(guest.firstName ?? guest.first_name, 80),
      lastName: text(guest.lastName ?? guest.last_name, 80),
      nationality: text(guest.nationality, 80),
      birthday: text(guest.birthday, 10),
      passportNumber: text(guest.passportNumber ?? guest.passport_number, 40),
    }
  })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error } = await supabase.rpc('portal_save_check_in_draft', {
    p_code: code,
    p_token: token,
    p_date: date,
    p_program: program,
    p_scope: scope,
    p_guests: guests,
  })
  if (error) {
    return NextResponse.json(
      { error: rpcMessage(error, 'Could not save these names. Please try again.') },
      { status: 400 },
    )
  }
  return NextResponse.json({ ok: true })
}
