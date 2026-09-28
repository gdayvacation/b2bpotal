import { NextResponse } from 'next/server'
import {
  createStaffSupabaseSession,
  isStaffRole,
  staffCookieOptions,
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
  const response = NextResponse.json({
    role,
    accessToken: session?.accessToken,
    refreshToken: session?.refreshToken,
  })
  response.cookies.set(STAFF_COOKIE, role, staffCookieOptions())
  return response
}
