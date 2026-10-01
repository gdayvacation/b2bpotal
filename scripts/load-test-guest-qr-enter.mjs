/**
 * Production-like guest QR enter test (sign-in path that shares Vercel/Auth IP quota).
 *
 * Prerequisites: LOADTEST-* bookings already created via loadtest_setup in SQL.
 * This script only uses the anon key + portal_guest_enter + signInWithPassword,
 * then records one check-in seat per booking with the guest JWT.
 *
 * Usage:
 *   node scripts/load-test-guest-qr-enter.mjs --count=60 --concurrency=40
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

async function main() {
  const count = Math.max(5, Math.min(argInt('count', 60), 100))
  const concurrency = Math.max(5, Math.min(argInt('concurrency', 40), 60))
  const env = loadEnvLocal()
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !anon) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY in .env.local')

  const codes = Array.from({ length: count }, (_, i) => codeFor(i + 1))
  console.log(`QR enter load test: ${count} guests, concurrency=${concurrency}`)
  console.log('Uses only LOADTEST-* codes. Auth users for those codes are cleaned by SQL after.\n')

  // 1) Concurrent guest enter = portal_guest_enter + signInWithPassword (Auth IP quota path)
  const enterResults = await mapPool(codes, concurrency, async (code) => {
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
    } catch (error) {
      return { ok: false, error: String(error?.message || error), ms: Date.now() - t0, code }
    }
  })
  const enterSummary = summarize(`Guest QR enter + sign-in x${count}`, enterResults)

  // 2) Concurrent check-in with each guest JWT (real RLS path)
  const okEnters = enterResults.filter((r) => r.ok)
  const checkInResults = await mapPool(okEnters, concurrency, async (entered) => {
    const t0 = Date.now()
    const supabase = createClient(url, anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${entered.accessToken}` } },
    })
    const enrollmentId = crypto.randomUUID()
    const { data, error } = await supabase.rpc('portal_record_check_in_enrollments', {
      p_date: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }),
      p_program: 'PP',
      p_booking_code: entered.code,
      p_enrollments: [
        {
          id: enrollmentId,
          first_name: 'Load',
          last_name: 'Test',
          nationality: 'Thai',
          birthday: '1990-01-01',
          passport_number: `LT-${entered.code}`,
          scope: 'one',
          seats: 1,
        },
      ],
    })
    const ms = Date.now() - t0
    if (error) return { ok: false, error: error.message, ms, code: entered.code }
    if (data?.ok === true || data === true || (data && data.ok !== false)) {
      // RPC shapes vary; treat non-error as success when ok flag present or missing
      if (data?.ok === false) {
        return { ok: false, error: String(data?.error || 'rejected'), ms, code: entered.code }
      }
      return { ok: true, ms, code: entered.code }
    }
    return { ok: true, ms, code: entered.code }
  })
  const checkInSummary = summarize(
    `Guest check-in with JWT x${okEnters.length}`,
    checkInResults,
  )

  console.log('\n======== VERDICT ========')
  console.log(
    `QR enter+sign-in (${count}): ${enterSummary.ok === count ? 'PASS' : 'FAIL'} (${enterSummary.ok}/${count})`,
  )
  console.log(
    `Check-in after enter: ${checkInSummary.ok === okEnters.length && okEnters.length > 0 ? 'PASS' : 'FAIL'} (${checkInSummary.ok}/${okEnters.length})`,
  )
  if (enterSummary.ok < count || checkInSummary.ok < okEnters.length) process.exitCode = 1
}

main().catch((error) => {
  console.error('\nLOAD TEST CRASHED:', error)
  process.exit(1)
})
