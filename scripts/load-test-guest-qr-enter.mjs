/**
 * Production-like guest QR enter test (sign-in path that shares Vercel/Auth IP quota).
 *
 * Prerequisites: LOADTEST-* bookings already created via loadtest_setup in SQL.
 *
 * Modes:
 *   --mode=direct   (default) calls Supabase directly (old path: portal_guest_enter + signInWithPassword)
 *   --mode=api      calls the Next.js API route (new path: generateLink + verifyOtp)
 *   --mode=both     runs direct first, then api, and prints a comparison (recommended for before/after)
 *
 * Usage:
 *   node scripts/load-test-guest-qr-enter.mjs --count=60 --concurrency=40 --mode=both
 *   node scripts/load-test-guest-qr-enter.mjs --count=60 --concurrency=40 --mode=api --api-url=http://localhost:3000
 *   node scripts/load-test-guest-qr-enter.mjs --count=60 --concurrency=40 --mode=api --api-url=https://gdayb2b.vercel.app
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnvLocal() {
  const path = resolve(process.cwd(), '.env.local')
  const raw = readFileSync(path, 'utf8')
  const env = {}
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (!m) continue
    let v = m[2] ?? ''
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    env[m[1]] = v
  }
  return env
}

function argInt(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (!hit) return fallback
  const n = Number(hit.split('=')[1])
  return Number.isFinite(n) ? n : fallback
}

function argStr(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  if (!hit) return fallback
  return hit.split('=').slice(1).join('=')
}

function codeFor(i) {
  return `LOADTEST-${String(i).padStart(4, '0')}`
}

async function mapPool(items, concurrency, worker) {
  const results = new Array(items.length)
  let cursor = 0
  async function run() {
    while (cursor < items.length) {
      const index = cursor
      cursor += 1
      results[index] = await worker(items[index], index)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  )
  return results
}

function summarize(label, results) {
  let ok = 0
  let fail = 0
  const errors = new Map()
  let minMs = Infinity
  let maxMs = 0
  let sumMs = 0
  for (const row of results) {
    if (row.ok) ok += 1
    else {
      fail += 1
      const key = row.error || 'unknown'
      errors.set(key, (errors.get(key) ?? 0) + 1)
    }
    minMs = Math.min(minMs, row.ms)
    maxMs = Math.max(maxMs, row.ms)
    sumMs += row.ms
  }
  const avg = results.length ? Math.round(sumMs / results.length) : 0
  console.log(`\n=== ${label} ===`)
  console.log(`ok=${ok} fail=${fail}  latency ms: min=${minMs} avg=${avg} max=${maxMs}`)
  if (errors.size) {
    console.log('errors:')
    for (const [msg, n] of [...errors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
      console.log(`  (${n}) ${msg}`)
    }
  }
  return { ok, fail, minMs, maxMs, avg }
}

// ─── OLD PATH: direct Supabase (portal_guest_enter + signInWithPassword) ────

async function runDirectPath(codes, concurrency, url, anon) {
  return mapPool(codes, concurrency, async (code) => {
    const t0 = Date.now()
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    try {
      const { data, error } = await supabase.rpc('portal_guest_enter', { p_code: code })
      if (error) return { ok: false, error: `enter: ${error.message}`, ms: Date.now() - t0, code }
      const row = Array.isArray(data) ? data[0] : data
      const email = String(row?.auth_email ?? '')
      const key = String(row?.access_key ?? '')
      if (!email || !key) {
        return { ok: false, error: 'enter: missing credentials', ms: Date.now() - t0, code }
      }
      const { data: sessionData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password: key,
      })
      if (authError || !sessionData.session) {
        return {
          ok: false,
          error: `signin: ${authError?.message || 'no session'}`,
          ms: Date.now() - t0,
          code,
        }
      }
      return {
        ok: true,
        ms: Date.now() - t0,
        code,
        accessToken: sessionData.session.access_token,
      }
    } catch (err) {
      return { ok: false, error: String(err?.message || err), ms: Date.now() - t0, code }
    }
  })
}

// ─── NEW PATH: via API route (generateLink + verifyOtp) ─────────────────────

async function runApiPath(codes, concurrency, apiUrl) {
  const endpoint = `${apiUrl.replace(/\/$/, '')}/api/check-in/guest/enter`
  return mapPool(codes, concurrency, async (code) => {
    const t0 = Date.now()
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, token: '' }),
      })
      const payload = await res.json().catch(() => ({}))
      const ms = Date.now() - t0
      if (!res.ok) {
        return { ok: false, error: `api(${res.status}): ${payload?.error || 'unknown'}`, ms, code }
      }
      if (!payload.accessToken || !payload.refreshToken) {
        return { ok: false, error: 'api: missing tokens in response', ms, code }
      }
      return { ok: true, ms, code, accessToken: payload.accessToken }
    } catch (err) {
      return { ok: false, error: String(err?.message || err), ms: Date.now() - t0, code }
    }
  })
}

// ─── Check-in with a guest JWT (verifies RLS still works) ───────────────────

async function runCheckIn(entered, concurrency, url, anon) {
  const okEnters = entered.filter((r) => r.ok)
  if (!okEnters.length) return []
  return mapPool(okEnters, concurrency, async (e) => {
    const t0 = Date.now()
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${e.accessToken}` } },
    })
    const enrollmentId = crypto.randomUUID()
    const { data, error } = await supabase.rpc('portal_record_check_in_enrollments', {
      p_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
      p_program: 'PP',
      p_booking_code: e.code,
      p_enrollments: [
        {
          id: enrollmentId,
          first_name: 'Load',
          last_name: 'Test',
          nationality: 'Thai',
          birthday: '1990-01-01',
          passport_number: `LT-${e.code}`,
          scope: 'one',
          seats: 1,
        },
      ],
    })
    const ms = Date.now() - t0
    if (error) return { ok: false, error: error.message, ms, code: e.code }
    if (data?.ok === false) {
      return { ok: false, error: String(data?.error || 'rejected'), ms, code: e.code }
    }
    return { ok: true, ms, code: e.code }
  })
}

async function main() {
  const count = Math.max(5, Math.min(argInt('count', 60), 100))
  const concurrency = Math.max(5, Math.min(argInt('concurrency', 40), 60))
  const mode = argStr('mode', 'direct')          // 'direct' | 'api' | 'both'
  const apiUrl = argStr('api-url', 'http://localhost:3000')

  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY in .env.local')

  const codes = Array.from({ length: count }, (_, i) => codeFor(i + 1))

  console.log(`QR enter load test: ${count} guests, concurrency=${concurrency}, mode=${mode}`)
  if (mode === 'api' || mode === 'both') {
    console.log(`API URL: ${apiUrl}`)
  }
  console.log('Uses only LOADTEST-* codes. Auth users for those codes are cleaned by SQL after.\n')

  let directSummary, apiSummary

  // ── Direct path (old: signInWithPassword) ─────────────────────────────────
  if (mode === 'direct' || mode === 'both') {
    console.log('\n──────────────────────────────────────────')
    console.log('PATH A: direct Supabase (portal_guest_enter + signInWithPassword)')
    console.log('──────────────────────────────────────────')
    const directResults = await runDirectPath(codes, concurrency, url, anon)
    directSummary = summarize(`A: Direct (signInWithPassword) x${count}`, directResults)

    const ciDirectResults = await runCheckIn(directResults, concurrency, url, anon)
    if (ciDirectResults.length) {
      summarize(`A: Check-in with JWT x${ciDirectResults.length}`, ciDirectResults)
    }
  }

  // ── API route path (new: generateLink + verifyOtp) ─────────────────────────
  if (mode === 'api' || mode === 'both') {
    console.log('\n──────────────────────────────────────────')
    console.log(`PATH B: API route  ${apiUrl}  (generateLink + verifyOtp)`)
    console.log('──────────────────────────────────────────')
    const apiResults = await runApiPath(codes, concurrency, apiUrl)
    apiSummary = summarize(`B: API route (generateLink) x${count}`, apiResults)

    const ciApiResults = await runCheckIn(apiResults, concurrency, url, anon)
    if (ciApiResults.length) {
      summarize(`B: Check-in with JWT x${ciApiResults.length}`, ciApiResults)
    }
  }

  // ── Comparison ─────────────────────────────────────────────────────────────
  console.log('\n======== VERDICT ========')
  if (directSummary) {
    const pass = directSummary.ok === count
    console.log(
      `A: direct+signInWithPassword (${count}): ${pass ? 'PASS' : 'FAIL'} (${directSummary.ok}/${count})  avg=${directSummary.avg}ms`,
    )
  }
  if (apiSummary) {
    const pass = apiSummary.ok === count
    console.log(
      `B: API route+generateLink   (${count}): ${pass ? 'PASS' : 'FAIL'} (${apiSummary.ok}/${count})  avg=${apiSummary.avg}ms`,
    )
  }
  if (directSummary && apiSummary) {
    const improvement = directSummary.avg - apiSummary.avg
    console.log(
      `\nLatency delta (A→B): ${improvement > 0 ? '-' : '+'}${Math.abs(improvement)}ms avg  ` +
      `(${improvement > 0 ? 'faster' : 'slower'} on new path)`,
    )
  }

  const anyFail =
    (directSummary && directSummary.fail > 0) || (apiSummary && apiSummary.fail > 0)
  if (anyFail) process.exitCode = 1
}

main().catch((err) => {
  console.error('\nLOAD TEST CRASHED:', err)
  process.exit(1)
})
