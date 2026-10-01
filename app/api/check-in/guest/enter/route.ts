import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { rpcMessage } from '@/lib/rpc-error'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { code?: string; token?: string } | null
  const code = String(body?.code ?? '').trim()
  const token = String(body?.token ?? '').trim()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })
  }
  if (!code) {
    return NextResponse.json({ error: 'This check-in QR is not valid.' }, { status: 401 })
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc('portal_guest_enter', { p_code: code, p_token: token })
  if (error) {
    return NextResponse.json(
      { error: rpcMessage(error, 'This check-in QR is not valid.') },
      { status: 401 },
    )
  }
  const row = Array.isArray(data) ? data[0] : data
  const authEmail = String(row?.auth_email ?? '')
  const accessKey = String(row?.access_key ?? '')
  if (!authEmail || !accessKey) {
    return NextResponse.json({ error: 'This check-in QR is not valid.' }, { status: 401 })
  }

  const { data: sessionData, error: authError } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: accessKey,
  })
  if (authError || !sessionData.session) {
    return NextResponse.json({ error: 'This check-in QR is not valid.' }, { status: 401 })
  }

  return NextResponse.json({
    code: row.booking_code,
    accessToken: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
  })
}
