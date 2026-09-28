import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { isStaffRole, STAFF_COOKIE } from '@/lib/staff-auth-server'

export async function GET() {
  const jar = await cookies()
  const role = jar.get(STAFF_COOKIE)?.value
  return NextResponse.json({ role: isStaffRole(role) ? role : null })
}
