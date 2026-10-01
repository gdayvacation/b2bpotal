import { NextResponse } from 'next/server'
import {
  createStaffSupabaseSession,
  encodeStaffCookie,
  isStaffRole,
  openStaffDeviceSession,
  staffCookieOptions,
  staffMaxSessions,
  staffPinConfigured,
  STAFF_COOKIE,
  verifyStaffPin,
} from '@/lib/staff-auth-server'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { role?: string; pin?: string }
    | null
  const role = body?.role
  const pin = typeof body?.pin === 'string' ? body.pin : ''

  if (!isStaffRole(role)) {
    return NextResponse.json({ error: 'PIN is incorrect.' }, { status: 400 })
  }
  if (!staffPinConfigured(role)) {
    return NextResponse.json(
      { error: 'Staff PIN is not configured on the server.' },
      { status: 500 },
    )
  }
  if (!verifyStaffPin(role, pin)) {
    return NextResponse.json({ error: 'PIN is incorrect.' }, { status: 401 })
  }

  const session = await createStaffSupabaseSession(role)
  if (!session?.accessToken || !session.refreshToken) {
    return NextResponse.json(
      { error: 'Could not create staff session. Check STAFF_SUPABASE_PASSWORD.' },
      { status: 500 },
    )
  }

  const device = await openStaffDeviceSession(role, session.accessToken)
  if (!device) {
    return NextResponse.json(
      {
        error:
          'Could not register this device session. Run supabase/add-staff-session-limit.sql then try again.',
      },
      { status: 500 },
    )
  }

  const response = NextResponse.json({
    role,
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    maxSessions: staffMaxSessions(role),
  })
  response.cookies.set(STAFF_COOKIE, encodeStaffCookie(device), staffCookieOptions())
  return response
}
