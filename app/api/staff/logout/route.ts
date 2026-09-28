import { NextResponse } from 'next/server'
import { STAFF_COOKIE, staffCookieOptions } from '@/lib/staff-auth-server'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set(STAFF_COOKIE, '', { ...staffCookieOptions(), maxAge: 0 })
  return response
}
