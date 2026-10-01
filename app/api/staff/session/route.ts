import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  createStaffSupabaseSession,
  parseStaffCookie,
  STAFF_COOKIE,
  staffCookieOptions,
  validateStaffDeviceSession,
} from '@/lib/staff-auth-server'

/** Re-issue the staff database session for a device whose browser lost it (cookie still valid). */
export async function POST() {
  const jar = await cookies()
  const parts = parseStaffCookie(jar.get(STAFF_COOKIE)?.value)
  if (!parts || !(await validateStaffDeviceSession(parts))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const session = await createStaffSupabaseSession(parts.role)
  if (!session) {
    return NextResponse.json({ error: 'Staff session is not available.' }, { status: 500 })
  }
  return NextResponse.json({ role: parts.role, ...session })
}

export async function GET() {
  const jar = await cookies()
  const parts = parseStaffCookie(jar.get(STAFF_COOKIE)?.value)
  if (!parts) {
    return NextResponse.json({ role: null })
  }

  const ok = await validateStaffDeviceSession(parts)
  if (!ok) {
    const response = NextResponse.json({ role: null, reason: 'session_replaced' })
    response.cookies.set(STAFF_COOKIE, '', { ...staffCookieOptions(), maxAge: 0 })
    return response
  }

  return NextResponse.json({ role: parts.role })
}
