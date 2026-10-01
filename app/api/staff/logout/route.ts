import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  closeStaffDeviceSession,
  parseStaffCookie,
  STAFF_COOKIE,
  staffCookieOptions,
} from '@/lib/staff-auth-server'

export async function POST() {
  const jar = await cookies()
  const parts = parseStaffCookie(jar.get(STAFF_COOKIE)?.value)
  await closeStaffDeviceSession(parts)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(STAFF_COOKIE, '', { ...staffCookieOptions(), maxAge: 0 })
  return response
}
