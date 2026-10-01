/**
 * Safe marina check-in / board stress test.
 * Uses only LOADTEST-#### bookings, then cleans them up.
 *
 * The loadtest_* RPCs are service-role only. Put SUPABASE_SERVICE_ROLE_KEY in
 * .env.local (never a NEXT_PUBLIC_ variable, never in Vercel) and run locally.
 *
 * Usage:
 *   node scripts/load-test-check-in.mjs
 *   node scripts/load-test-check-in.mjs --count=200
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

function serviceClient(env) {
  if (Object.keys(env).some((key) => key.startsWith('NEXT_PUBLIC_') && key.includes('SERVICE_ROLE'))) {
    throw new Error('Remove NEXT_PUBLIC_*SERVICE_ROLE* from .env.local — that would ship the key to browsers.')
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local')
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
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
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, () => run())
  await Promise.all(runners)
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
    for (const [msg, n] of [...errors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`  (${n}) ${msg}`)
    }
  }
  return { ok, fail, minMs, maxMs, avg }
}

async function main() {
  const count = Math.max(10, Math.min(argInt('count', 200), 250))
  const concurrency = Math.max(5, Math.min(argInt('concurrency', 40), 80))
  const supabase = serviceClient(loadEnvLocal())

  console.log(`Load test starting: ${count} guests, concurrency=${concurrency}`)
  console.log('Only LOADTEST-* rows are created; cleanup runs at the end.\n')

  const setupStarted = Date.now()
  const { data: setup, error: setupError } = await supabase.rpc('loadtest_setup', {
    p_count: count,
  })
  if (setupError) throw new Error(`setup failed: ${setupError.message}`)
  if (!setup?.ok) throw new Error(`setup failed: ${setup?.error || 'unknown'}`)
  console.log(`setup ok in ${Date.now() - setupStarted}ms — created ${setup.created} bookings for ${setup.date}`)

  const codes = Array.from({ length: count }, (_, i) => codeFor(i + 1))

  // 1) Concurrent guest check-ins (one seat per booking) — simulates QR scans
  const checkInResults = await mapPool(codes, concurrency, async (code) => {
    const t0 = Date.now()
    const { data, error } = await supabase.rpc('loadtest_guest_check_in', { p_code: code })
    const ms = Date.now() - t0
    if (error) return { ok: false, error: error.message, ms, code }
    if (data?.ok === true) return { ok: true, ms, code, fully: data.fully_checked === true }
    return { ok: false, error: String(data?.error || 'check-in rejected'), ms, code }
  })
  const checkInSummary = summarize(`Guest QR check-in x${count}`, checkInResults)

  // 2) Same-booking double submit storm (should reject extras — seat lock)
  const collisionCodes = codes.slice(0, Math.min(40, count))
  const collisionJobs = collisionCodes.flatMap((code) => [code, code, code])
  const collisionResults = await mapPool(collisionJobs, concurrency, async (code) => {
    const t0 = Date.now()
    const { data, error } = await supabase.rpc('loadtest_guest_check_in', { p_code: code })
    const ms = Date.now() - t0
    if (error) return { ok: false, error: error.message, ms, code }
    return {
      ok: data?.ok === true,
      rejected: data?.ok === false,
      error: data?.ok === false ? String(data?.error || 'rejected') : undefined,
      ms,
      code,
    }
  })
  const collisionOk = collisionResults.filter((r) => r.ok).length
  const collisionRejected = collisionResults.filter((r) => r.rejected).length
  console.log(`\n=== Double-scan collision x${collisionJobs.length} (same booking) ===`)
  console.log(
    `accepted=${collisionOk} rejected=${collisionRejected} (expect accepted≈0, rejected≈all because already full)`,
  )

  // 3) Admin/helper board snapshot reads under load
  const boardJobs = Array.from({ length: 60 }, (_, i) => i)
  const boardResults = await mapPool(boardJobs, 20, async () => {
    const t0 = Date.now()
    const { data, error } = await supabase.rpc('loadtest_board_snapshot')
    const ms = Date.now() - t0
    if (error) return { ok: false, error: error.message, ms }
    return { ok: true, ms, snapshot: data }
  })
  summarize('Admin/Helper board snapshot reads x60', boardResults)
  const boardSnap = boardResults.find((r) => r.ok)?.snapshot
  if (boardSnap) {
    console.log('board snapshot sample:', JSON.stringify(boardSnap))
  }

  // 4) Concurrent boat moves (per-booking upsert) — safer path
  const boatResults = await mapPool(codes, concurrency, async (code, index) => {
    const boat = (index % 3) + 1
    const t0 = Date.now()
    const { data, error } = await supabase.rpc('loadtest_assign_boat', {
      p_code: code,
      p_boat: boat,
    })
    const ms = Date.now() - t0
    if (error) return { ok: false, error: error.message, ms, code }
    if (data?.ok === true) return { ok: true, ms, code, boat }
    return { ok: false, error: String(data?.error || 'assign failed'), ms, code }
  })
  summarize(`Per-booking boat assign x${count}`, boatResults)

  // 5) Simulate dangerous full-board save race (last-write-wins) on a small subset
  //    by assigning the same 20 bookings to boat 1 then immediately boat 2 in two waves.
  const raceCodes = codes.slice(0, Math.min(20, count))
  const raceWave1 = await mapPool(raceCodes, 20, async (code) => {
    const t0 = Date.now()
    const { data, error } = await supabase.rpc('loadtest_assign_boat', { p_code: code, p_boat: 1 })
    return { ok: !error && data?.ok === true, ms: Date.now() - t0, error: error?.message }
  })
  const raceWave2 = await mapPool(raceCodes, 20, async (code) => {
    const t0 = Date.now()
    const { data, error } = await supabase.rpc('loadtest_assign_boat', { p_code: code, p_boat: 2 })
    return { ok: !error && data?.ok === true, ms: Date.now() - t0, error: error?.message }
  })
  console.log(`\n=== Boat swap waves (1 then 2) on ${raceCodes.length} bookings ===`)
  console.log(`wave1 ok=${raceWave1.filter((r) => r.ok).length} wave2 ok=${raceWave2.filter((r) => r.ok).length}`)

  const { data: finalSnap, error: finalErr } = await supabase.rpc('loadtest_board_snapshot')
  if (finalErr) console.error('final snapshot error', finalErr.message)
  else console.log('\nPRE-CLEANUP board snapshot:', JSON.stringify(finalSnap, null, 2))

  const checkInPass =
    checkInSummary.ok === count &&
    checkInSummary.fail === 0 &&
    Number(finalSnap?.enrollments) === count &&
    Number(finalSnap?.attendance_checked) === count &&
    Number(finalSnap?.overbooked_bookings) === 0
  const collisionPass = collisionOk === 0
  const boatPass =
    boatResults.every((r) => r.ok) && Number(finalSnap?.boat_assignments) === count

  const { data: cleanup, error: cleanupError } = await supabase.rpc('loadtest_cleanup')
  if (cleanupError) {
    console.error('\nCLEANUP FAILED — run select loadtest_cleanup(); in SQL', cleanupError.message)
  } else {
    console.log('\nCLEANUP:', JSON.stringify(cleanup))
  }

  const { data: afterClean } = await supabase.rpc('loadtest_board_snapshot')
  const cleanupPass =
    cleanup?.ok === true &&
    Number(afterClean?.bookings) === 0 &&
    Number(afterClean?.enrollments) === 0

  console.log('\n======== VERDICT ========')
  console.log(`Guest concurrent check-in (${count}): ${checkInPass ? 'PASS' : 'FAIL'}`)
  console.log(`Seat-lock rejects double scan: ${collisionPass ? 'PASS' : 'FAIL'} (accepted=${collisionOk})`)
  console.log(`Per-booking boat assign concurrent: ${boatPass ? 'PASS' : 'FAIL'}`)
  console.log(
    'Note: Admin UI full-day boat save (delete-all + insert) can still race if two staff save the whole board at once. Per-booking moves (tested) are OK.',
  )
  console.log(`Cleanup LOADTEST data: ${cleanupPass ? 'PASS' : 'FAIL'}`)

  if (!checkInPass || !collisionPass || !boatPass || !cleanupPass) {
    process.exitCode = 1
  } else {
    console.log('\nSystem handled the simulated morning rush without check-in data corruption.')
  }
}

main().catch((error) => {
  console.error('\nLOAD TEST CRASHED:', error)
  let client
  try {
    client = serviceClient(loadEnvLocal())
  } catch {
    process.exit(1)
  }
  client
    .rpc('loadtest_cleanup')
    .then(({ error }) => {
      if (error) console.error('cleanup after crash failed:', error.message)
      else console.error('cleanup after crash: ok')
      process.exit(1)
    })
})
