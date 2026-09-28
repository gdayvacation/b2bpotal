import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  HELPER_DATE_COOKIE,
  HELPER_KEY_COOKIE,
  helperCookieOptions,
} from '@/lib/check-in-access'
import { rpcMessage } from '@/lib/rpc-error'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { date?: string; key?: string }
    | null
  const tourDate = String(body?.date ?? '').trim()
  const jar = await cookies()
  const key = String(body?.key ?? jar.get(HELPER_KEY_COOKIE)?.value ?? '').trim()
  const cookieDate = String(jar.get(HELPER_DATE_COOKIE)?.value ?? '').trim()
  const date = /^\d{4}-\d{2}-\d{2}$/.test(tourDate)
    ? tourDate
    : /^\d{4}-\d{2}-\d{2}$/.test(cookieDate)
      ? cookieDate
      : ''

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })
  }
  if (!date || !key) {
    return NextResponse.json(
      { error: 'This helper QR is not valid.', boardState: 'invalid' },
      { status: 401 },
    )
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc('portal_helper_enter', {
    p_date: date,
    p_key: key,
  })
  if (error) {
    return NextResponse.json(
      {
        error: rpcMessage(error, 'This helper QR is not valid.'),
        boardState: 'invalid',
      },
      { status: 401 },
    )
  }
  const row = Array.isArray(data) ? data[0] : data
  const boardState = String(row?.board_state ?? 'invalid')
  const openTime = String(row?.open_time ?? '')
  const closeTime = String(row?.close_time ?? '')
  const authEmail = String(row?.auth_email ?? '')

  if (boardState !== 'ok') {
    return NextResponse.json(
      {
        error:
          boardState === 'too_early'
            ? 'Helper board is not open yet.'
            : boardState === 'closed'
              ? 'Helper board is closed.'
              : 'This helper QR is not valid.',
        boardState,
        date,
        openTime,
        closeTime,
      },
      { status: 403 },
    )
  }
  if (!authEmail) {
    return NextResponse.json(
      { error: 'This helper QR is not valid.', boardState: 'invalid' },
      { status: 401 },
    )
  }

  const { data: sessionData, error: authError } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: key,
  })
  if (authError || !sessionData.session) {
    return NextResponse.json(
      { error: 'This helper QR is not valid.', boardState: 'invalid' },
      { status: 401 },
    )
  }

  const cookie = helperCookieOptions()
  const response = NextResponse.json({
    date,
    openTime,
    closeTime,
    boardState: 'ok',
    accessToken: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
  })
  response.cookies.set(HELPER_DATE_COOKIE, date, cookie)
  response.cookies.set(HELPER_KEY_COOKIE, key, cookie)
  return response
}
