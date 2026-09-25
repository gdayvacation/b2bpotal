import { NextRequest } from 'next/server'
import { runSheetsBackup } from '@/lib/sheets/sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET?.trim()
  const header = request.headers.get('authorization') ?? ''
  const bearer = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (secret && bearer === secret) return true
  if (request.headers.has('x-vercel-cron')) return true
  return false
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runSheetsBackup()
    return Response.json(result)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sheets backup failed'
    console.error('[sheets-backup]', error)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
