import { NextRequest } from 'next/server'
import { freezeLiveSheet } from '@/lib/sheets/snapshot'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  const header = request.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (secret) return bearer === secret
  return request.headers.has('x-vercel-cron')
}

function thaiStamp(now = new Date()) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await freezeLiveSheet(thaiStamp())
    if (result.blocked) {
      return Response.json({ ok: false, error: result.note, ...result }, { status: 409 })
    }
    return Response.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sheet snapshot failed'
    console.error('[sheets-snapshot]', error)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
