import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { helperBoardPath } from '@/lib/check-in-helper'
import { rpcMessage } from '@/lib/rpc-error'
import { hasStaffSession, STAFF_COOKIE, STAFF_ADMIN_EMAIL } from '@/lib/staff-auth-server'

export async function POST() {
  const jar = await cookies()
  if (!(await hasStaffSession(jar.get(STAFF_COOKIE)?.value, 'admin'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  const password = process.env.STAFF_SUPABASE_PASSWORD?.trim()
  if (!url || !anonKey || !password) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: STAFF_ADMIN_EMAIL,
    password,
  })
  if (authError) {
    return NextResponse.json({ error: 'Staff session is not available.' }, { status: 500 })
  }

  const { data, error } = await supabase.rpc('portal_admin_open_helper_board')
  if (error) {
    return NextResponse.json(
      { error: rpcMessage(error, 'Could not create helper QR.') },
      { status: 400 },
    )
  }
  const row = Array.isArray(data) ? data[0] : data
  const key = String(row?.access_key ?? '')
  const date = String(row?.tour_date ?? '').slice(0, 10)
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Could not create helper QR.' }, { status: 500 })
  }

  return NextResponse.json({
    date,
    key,
    path: helperBoardPath(date, key),
  })
}
