import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const STAFF_COOKIE = 'gday-staff'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl
  const role = request.cookies.get(STAFF_COOKIE)?.value

  if (pathname.startsWith('/api/staff/login') || pathname.startsWith('/api/staff/session')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/staff/') && !role) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/staff/:path*'],
}
