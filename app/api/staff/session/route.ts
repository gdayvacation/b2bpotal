import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  parseStaffCookie,
  STAFF_COOKIE,
  staffCookieOptions,
  validateStaffDeviceSession,
} from '@/lib/staff-auth-server'

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
