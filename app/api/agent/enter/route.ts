import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import {
  AGENT_KEY_COOKIE,
  AGENT_SLUG_COOKIE,
  agentCookieOptions,
} from '@/lib/agent-access'

function rpcMessage(error: { message?: string } | null, fallback: string) {
  const raw = error?.message?.trim()
  if (!raw) return fallback
  return raw.replace(/^ERROR:\s*/i, '').replace(/\s*\(SQLSTATE\s+\w+\)\s*$/i, '')
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { slug?: string; key?: string }
    | null
  const slug = String(body?.slug ?? '').trim().toLowerCase()
  const jar = await cookies()
  const key = String(body?.key ?? jar.get(AGENT_KEY_COOKIE)?.value ?? '').trim()

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  if (!url || !anonKey) {
    return NextResponse.json({ error: 'Supabase is not configured.' }, { status: 500 })
  }
  if (!slug || !key) {
    return NextResponse.json({ error: 'This booking link is not valid.' }, { status: 401 })
  }

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await supabase.rpc('portal_agent_enter', {
    p_slug: slug,
    p_key: key,
  })
  if (error) {
    return NextResponse.json(
      { error: rpcMessage(error, 'This booking link is not valid.') },
      { status: 401 },
    )
  }
  const row = Array.isArray(data) ? data[0] : data
  const authEmail = String(row?.auth_email ?? '')
  if (!authEmail) {
    return NextResponse.json({ error: 'This booking link is not valid.' }, { status: 401 })
  }

  const { data: sessionData, error: authError } = await supabase.auth.signInWithPassword({
    email: authEmail,
    password: key,
  })
  if (authError || !sessionData.session) {
    return NextResponse.json(
      { error: 'This booking link is not valid.' },
      { status: 401 },
    )
  }

  const cookie = agentCookieOptions()
  const response = NextResponse.json({
    slug: row.slug,
    name: row.name,
    accessToken: sessionData.session.access_token,
    refreshToken: sessionData.session.refresh_token,
  })
  response.cookies.set(AGENT_SLUG_COOKIE, slug, cookie)
  response.cookies.set(AGENT_KEY_COOKIE, key, cookie)
  return response
}
