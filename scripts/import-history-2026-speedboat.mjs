/**
 * Parse Feb–Aug'26 Goodday Speedboat.xlsx → PP + James Bond history bookings.
 *
 * Usage:
 *   node scripts/import-history-2026-speedboat.mjs
 *   node scripts/import-history-2026-speedboat.mjs --apply
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const DOWNLOADS = path.join(process.env.HOME || '', 'Downloads')

const MONTHS = [
  { key: 'Feb', file: "Feb'26 Goodday Speedboat.xlsx", month: 2, days: 28 },
  { key: 'Mar', file: "Mar'26 Goodday Speedboat.xlsx", month: 3, days: 31 },
  { key: 'Apr', file: "Apr'26 Goodday Speedboat.xlsx", month: 4, days: 30 },
  { key: 'May', file: "May'26 Goodday Speedboat.xlsx", month: 5, days: 31 },
  { key: 'June', file: "June'26 Goodday Speedboat.xlsx", month: 6, days: 30 },
  { key: 'July', file: "July'26 Goodday Speedboat.xlsx", month: 7, days: 31 },
  { key: 'August', file: "August'26 Goodday Speedboat.xlsx", month: 8, days: 31 },
]

const PARK_RATES = {
  PP: { adult: 400, child: 200 },
  'James Bond': { adult: 300, child: 150 },
}

const DATE_FROM = '2026-02-01'
const DATE_TO = '2026-08-31'
const SQL_OUT = path.join(SCRIPT_DIR, '../supabase/seed-history-feb-aug-2026-speedboat.sql')

function cell(row, i) {
  return String(row[i] ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\u200e/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function num(row, i) {
  const t = cell(row, i).replace(/,/g, '')
  if (!t || t === '-') return 0
  const n = Number(t)
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0
}

function sqlStr(value) {
  return `'${String(value ?? '').replace(/'/g, "''")}'`
}

function sqlNull(value) {
  return value == null ? 'null' : sqlStr(value)
}

function slugify(name) {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'agent'
  )
}

function normalizeAgent(raw) {
  const s = raw.replace(/\s+/g, ' ').trim()
  const l = s.toLowerCase()
  if (!s || s === '-') return 'Unknown'
  if (/^good\s*day/.test(l)) return /ttt/i.test(s) ? 'Good Day (TTT)' : 'Good Day'
  if (/booking\s*window|^booking$|^window$/.test(l)) return 'Booking Window'
  if (/star\s*edge|starday/.test(l)) return 'Star Edge'
  if (l === '888') return '888'
  if (/^exp$|experience holiday/.test(l)) return 'EXP'
  if (/leisure hop/.test(l)) return 'Leisure Hopper'
  if (/smile/.test(l)) return 'Smile Leisure'
  if (/^dj$/.test(l)) return 'DJ'
  if (/yatri/.test(l)) return 'Yatri Holidays'
  return s
}

function normalizeZone(zone, hotel) {
  const z = zone.trim()
  const zl = z.toLowerCase()
  if (zl === 'private' || zl === 'privat') return 'Private'
  if (zl === 'patong') return 'Patong'
  if (zl === 'kata') return 'Kata'
  if (zl === 'karon') return 'Karon'
  if (zl === 'kamala') return 'Kamala'
  if (zl === 'kalim') return 'Kalim'
  if (zl === 'tritrang') return 'Tritrang'
  if (zl === 'town') return 'Town'
  if (z === 'สิเหร่') return 'สิเหร่'
  if (/khao\s*keaw|khaokeaw|khao\s*kaew/i.test(z)) return 'Khao Keaw'
  if (/no\s*tran/i.test(hotel) && !z) return 'No Transfer'
  if (!z) return 'Other'
  return z
}

function cleanHotel(hotel) {
  const stripped = hotel
    .replace(/^no\s*tarn?s?fer\s*[/\-–]?\s*/i, '')
    .replace(/^no\s*tran[s]?fer\s*[/\-–]?\s*/i, '')
    .trim()
  if (/^no\s*tran/i.test(hotel) && !stripped) return ''
  return stripped
}

function parseCotAmount(raw) {
  const match = String(raw || '')
    .replace(/,/g, '')
    .match(/(\d+(?:\.\d+)?)/)
  if (!match) return 0
  const value = Number(match[1])
  return Number.isFinite(value) ? value : 0
}

function formatThb(amount) {
  return `${Math.round(amount).toLocaleString('en-US')} THB`
}

function isCancelled(remark) {
  return /cxl|cancel|ยกเลิก/i.test(remark)
}

function parkExcluded(remark) {
  return /excl(?:uding)?(?:\s*national)?(?:\s*park)?|\bexc\b[\s.]*npf|exc\s*npf|npf\s*excl/i.test(
    remark,
  )
}

function parkIncludedRemark(remark) {
  return /inc(?:luding)?\s*npf|inc\s*npf|including national/i.test(remark)
}

function canoeFromRemark(remark, program) {
  if (program !== 'James Bond') return null
  if (/no canoe|exc(?:luded|luding)?\s*(?:sea\s*)?canoe|exc\s*canoe/i.test(remark)) {
    return 'Not Included'
  }
  return 'Included'
}

function rowLine(row, end = 6) {
  return Array.from({ length: end }, (_, i) => cell(row, i)).filter(Boolean).join(' | ')
}

function isJameBondMarker(row) {
  const line = rowLine(row).toLowerCase()
  return /jame\s*bond/.test(line) && !/phi phi/.test(line)
}

function isPhiPhiProduct(row) {
  const text = `${cell(row, 0)} ${cell(row, 3)}`
  return /phi phi/i.test(text) && /private speed|island tour/i.test(text)
}

function isJamesBondProduct(row) {
  return /james bond island/i.test(`${cell(row, 0)} ${cell(row, 3)}`)
}

function isTotalsRow(row) {
  return !cell(row, 1) && !cell(row, 3) && num(row, 7) > 0
}

function peekSectionProgram(rows, start) {
  for (let index = start; index < Math.min(start + 10, rows.length); index += 1) {
    if (isPhiPhiProduct(rows[index])) return 'PP'
    if (isJamesBondProduct(rows[index]) || isJameBondMarker(rows[index])) return 'James Bond'
    const agent = cell(rows[index], 1)
    const remark = cell(rows[index], 12)
    if (agent && agent.toLowerCase() !== 'agent' && /canoe/i.test(remark)) return 'James Bond'
  }
  return 'PP'
}

function extraChargeFromRemark(remark) {
  const pax = remark.match(/extra\s*charge\s*(\d+)\s*\/?\s*pax/i)
  if (pax) return `Extra Charge ${pax[1]}/pax`
  const car = remark.match(/(?:ชาร์จค่ารถ|charge car)\s*(\d+)/i)
  if (car) return `Private car ${Number(car[1]).toLocaleString('en-US')} THB`
  return ''
}

function lateFeeFromRemark(remark, adults, children) {
  if (!/เลื่อนวัน|date change|ชาร์จออฟฟิศค่าเลื่อนวัน/i.test(remark)) return 0
  const per = remark.match(/หัวละ\s*(\d+)|(\d+)\s*ต่อหัว|(\d+)\s*\/\s*pax/i)
  const rate = per ? Number(per[1] || per[2] || per[3]) : 300
  if (!Number.isFinite(rate)) return 0
  return rate * (adults + children)
}

function noteParts({ wa, remark, van, extra, hotelRaw }) {
  const parts = []
  const waClean = wa.replace(/^[-–]+$/, '').trim()
  if (waClean && /group/i.test(waClean)) parts.push('Group')
  else if (waClean && /\d/.test(waClean)) parts.push(`WhatsApp ${waClean}`)

  let leftover = remark
    .replace(/exclud(?:e|ing)?\s*national\s*park\s*fee/gi, '')
    .replace(/\bexc(?:l)?\.?\s*npf\b/gi, '')
    .replace(/\bexc\s*npf\b/gi, '')
    .replace(/\bnpf\b/gi, '')
    .replace(/extra\s*charge\s*\d+\s*\/?\s*pax/gi, '')
    .replace(/(?:ชาร์จค่ารถ|charge car)\s*\d+(?:\s*thb)?/gi, '')
    .replace(/cash on tour/gi, '')
    .replace(/\b(?:no\s+)?(?:sea\s+)?canoe\b/gi, '')
    .replace(/\bexc(?:luded|luding)?\s*(?:sea\s*)?canoe\b/gi, '')
    .replace(/\binc(?:luding)?\s*(?:sea\s*)?canoe\b/gi, '')
    .replace(/\bcxl\b/gi, '')
    .replace(/[/\-–|,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (leftover && leftover.length > 1) parts.push(leftover)
  if (van) parts.push(van)
  if (extra) parts.push(extra)
  return parts.filter(Boolean).join(' · ')
}

function mapPickupTime(zone, pickup) {
  if (zone === 'No Transfer') return pickup || 'No transfer'
  if (!pickup) return zone === 'Other' ? 'Awaiting pickup time' : ''
  return pickup
}

function mapStatus(remark, pickupTime) {
  if (isCancelled(remark)) return 'Cancelled'
  if (!pickupTime || pickupTime === 'Awaiting pickup time') return 'Pending Pickup Time'
  return 'Confirmed'
}

function mapPrivate(zone, van, remark) {
  if (zone !== 'Private') {
    return { vehicle: '', price: '', driver: '', phone: '' }
  }
  const blob = `${van} ${remark}`
  const isCar = /\bcar\b|ค่ารถ\s*1400|car no/i.test(blob) && !/\bvan\b/i.test(blob)
  return {
    vehicle: isCar ? 'Car' : 'Van',
    price: isCar ? '1,400 THB' : '1,600 THB',
    driver: '',
    phone: '',
  }
}

function isHeader(row) {
  const a = cell(row, 1).toLowerCase()
  const n = cell(row, 3).toLowerCase()
  return a === 'agent' || n === 'name' || cell(row, 0).startsWith('ใบงาน')
}

function isJunkGuest(guest) {
  return /phi phi island tour|private speed boat|james bond island tour/i.test(guest)
}

function dayFromSheet(sheetName, rows, expectedMonth) {
  for (let i = 0; i < Math.min(5, rows.length); i += 1) {
    const title = cell(rows[i], 0) || cell(rows[i], 1)
    const match = title.match(/ใบงาน\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*2026/)
    if (match) {
      const day = Number(match[1])
      const month = Number(match[2])
      if (month === expectedMonth && day >= 1 && day <= 31) return day
    }
  }
  const asNum = Number(sheetName)
  if (Number.isInteger(asNum) && asNum >= 1 && asNum <= 31) return asNum
  // May/June odd tab names: 15→1, 25→2 … / 16→1, 26→2 …
  if (/^\d+[56]$/.test(sheetName)) {
    const day = Math.floor(Number(sheetName) / 10)
    if (day >= 1 && day <= 31) return day
  }
  return null
}

export function parseMonthWorkbook(meta) {
  const filePath = path.join(DOWNLOADS, meta.file)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing workbook: ${filePath}`)
  }
  const wb = XLSX.readFile(filePath, { raw: false })
  const bookings = []
  const skipped = []
  const seenDays = new Set()

  for (const sheetName of wb.SheetNames) {
    if (sheetName === 'รวม' || /summary|รวม/i.test(sheetName)) continue
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
    })
    const day = dayFromSheet(sheetName, rows, meta.month)
    if (!day || day > meta.days) {
      skipped.push({ date: `2026-${String(meta.month).padStart(2, '0')}-??`, reason: `bad sheet ${sheetName}`, sheetName })
      continue
    }
    if (seenDays.has(day)) {
      skipped.push({
        date: `2026-${String(meta.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        reason: `duplicate sheet ${sheetName}`,
        sheetName,
      })
      continue
    }
    seenDays.add(day)
    const date = `2026-${String(meta.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

    let program = 'PP'
    let justSawJameBond = false
    let lastWasTotals = false

    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex]
      if (isJameBondMarker(row)) {
        program = 'James Bond'
        justSawJameBond = true
        lastWasTotals = false
        continue
      }
      if (isPhiPhiProduct(row)) {
        program = 'PP'
        justSawJameBond = false
        continue
      }
      if (isJamesBondProduct(row)) {
        program = 'James Bond'
        justSawJameBond = false
        continue
      }
      if (cell(row, 0).startsWith('ใบงาน')) {
        if (!justSawJameBond && lastWasTotals) {
          program = peekSectionProgram(rows, rowIndex + 1)
        }
        justSawJameBond = false
        continue
      }
      if (isHeader(row)) continue
      if (isTotalsRow(row)) {
        lastWasTotals = true
        continue
      }

      const agentRaw = cell(row, 1)
      const voucher = cell(row, 2).replace(/^-+$/, '')
      let guest = cell(row, 3)
      const wa = cell(row, 4)
      const hotelRaw = cell(row, 5)
      const room = cell(row, 6)
      const adults = num(row, 7)
      const children = num(row, 8)
      const infants = num(row, 9)
      const tourLeaders = num(row, 10)
      const cotRaw = cell(row, 11)
      const remark = cell(row, 12)
      const pickup = cell(row, 13)
      const zoneRaw = cell(row, 14)
      const van = cell(row, 15)
      const extra = cell(row, 16)

      if (!guest && !voucher && !agentRaw && !hotelRaw) continue
      if (isJunkGuest(guest)) continue
      if (!guest && (voucher || agentRaw || hotelRaw) && adults + children + infants + tourLeaders > 0) {
        guest = 'TBA'
      }
      if (!guest) continue
      if (adults + children + infants + tourLeaders < 1) {
        skipped.push({ date, program, reason: 'zero pax', guest, voucher })
        continue
      }

      lastWasTotals = false
      justSawJameBond = false

      let agentName = normalizeAgent(agentRaw)
      if (!agentRaw || agentName === 'Unknown') {
        agentName = 'Booking Window'
      }
      const pickupZone = normalizeZone(zoneRaw, hotelRaw)
      const pickupHotel = cleanHotel(hotelRaw)
      const parkFee =
        parkExcluded(remark) && !parkIncludedRemark(remark) ? 'Not Included' : 'Included'
      const rates = PARK_RATES[program]
      const parkTotal = adults * rates.adult + children * rates.child
      const cotNum = parseCotAmount(cotRaw)
      const cashOnTour =
        cotNum > 0 && !(parkFee === 'Not Included' && cotNum === parkTotal)
          ? formatThb(cotNum)
          : ''
      const transferExtra = extraChargeFromRemark(remark)
      const pickupTime = mapPickupTime(pickupZone, pickup) || 'Awaiting pickup time'
      const priv = mapPrivate(pickupZone, van, remark)
      // Historical months — keep useful note bits from the old sheet.
      const note = noteParts({ wa, remark, van, extra, hotelRaw })

      bookings.push({
        date,
        agentSlug: slugify(agentName),
        agentName,
        agentRef: voucher === '-' ? '' : voucher,
        program,
        parkFee,
        canoe: canoeFromRemark(remark, program),
        adults,
        children,
        infants,
        tourLeaders,
        leadGuest: guest,
        pickupZone,
        pickupHotel,
        roomNumber: room,
        note,
        cashOnTour,
        transferExtraCharge: transferExtra,
        privateTransferVehicle: priv.vehicle,
        privateTransferPrice: priv.price,
        privateDriverName: priv.driver,
        privateDriverPhone: priv.phone,
        pickupTime,
        status: mapStatus(remark, pickupTime),
        lateChangeFee: lateFeeFromRemark(remark, adults, children),
      })
    }
  }

  return { bookings, skipped, meta }
}

export function parseAllHistory() {
  const bookings = []
  const skipped = []
  for (const meta of MONTHS) {
    const parsed = parseMonthWorkbook(meta)
    bookings.push(...parsed.bookings)
    skipped.push(...parsed.skipped.map((s) => ({ ...s, month: meta.key })))
  }
  bookings.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.program.localeCompare(b.program) ||
      a.leadGuest.localeCompare(b.leadGuest),
  )
  return { bookings, skipped }
}

function assignCodes(bookings) {
  const sequence = {}
  return bookings.map((booking) => {
    const ym = booking.date.slice(2, 4) + booking.date.slice(5, 7) // 2602
    const key = `${booking.program}|${ym}`
    sequence[key] = (sequence[key] || 0) + 1
    const prefix = booking.program === 'PP' ? 'PP' : 'JB'
    return {
      ...booking,
      code: `${prefix}${ym}-${String(sequence[key]).padStart(4, '0')}`,
    }
  })
}

function collectAgents(bookings) {
  const map = new Map()
  for (const b of bookings) {
    if (!map.has(b.agentSlug)) map.set(b.agentSlug, b.agentName)
  }
  return [...map.entries()].map(([slug, name]) => ({ slug, name }))
}

function collectZones(bookings) {
  const defaults = [
    { name: 'Patong', time: '07:30', pending: false, sort: 10 },
    { name: 'Kata', time: '07:45', pending: false, sort: 20 },
    { name: 'Karon', time: '08:00', pending: false, sort: 30 },
    { name: 'Kamala', time: '07:45', pending: false, sort: 40 },
    { name: 'Kalim', time: '07:50', pending: false, sort: 50 },
    { name: 'Tritrang', time: '07:45', pending: false, sort: 60 },
    { name: 'Town', time: '08:50', pending: false, sort: 70 },
    { name: 'สิเหร่', time: '08:00', pending: false, sort: 80 },
    { name: 'Khao Keaw', time: '07:30', pending: false, sort: 90 },
    { name: 'Private', time: 'Reach 09:30', pending: false, sort: 95 },
    { name: 'No Transfer', time: 'No transfer', pending: false, sort: 96 },
    { name: 'Other', time: 'Awaiting pickup time', pending: true, sort: 999 },
  ]
  const have = new Set(defaults.map((z) => z.name))
  for (const b of bookings) {
    if (!have.has(b.pickupZone)) {
      defaults.push({
        name: b.pickupZone,
        time: b.pickupTime || 'Awaiting pickup time',
        pending: false,
        sort: 200,
      })
      have.add(b.pickupZone)
    }
  }
  return defaults
}

function bookingSqlRow(b, code) {
  return `  (${[
    sqlStr(code),
    sqlStr(b.agentSlug),
    sqlStr(b.agentName),
    sqlStr(b.agentRef),
    sqlStr(b.program),
    sqlStr(b.date),
    sqlStr(b.parkFee),
    sqlNull(b.canoe),
    b.adults,
    b.children,
    b.infants,
    b.tourLeaders,
    sqlStr(b.leadGuest),
    sqlStr(b.pickupZone),
    sqlStr(b.pickupHotel),
    sqlStr(b.roomNumber),
    sqlStr(b.note),
    sqlStr(b.cashOnTour),
    sqlStr(b.transferExtraCharge),
    sqlStr(b.privateTransferVehicle),
    sqlStr(b.privateTransferPrice),
    sqlStr(b.privateDriverName),
    sqlStr(b.privateDriverPhone),
    sqlStr(b.pickupTime),
    sqlStr(b.status),
    b.lateChangeFee,
  ].join(', ')})`
}

export function buildSql(bookings) {
  const agents = collectAgents(bookings)
  const zones = collectZones(bookings)
  const coded = assignCodes(bookings)
  const agentSql = agents
    .map((a) => `  (${sqlStr(a.slug)}, ${sqlStr(a.name)}, '', 'Active')`)
    .join(',\n')
  const zoneSql = zones
    .map((z) => `  (${sqlStr(z.name)}, ${sqlStr(z.time)}, ${z.pending}, ${z.sort})`)
    .join(',\n')
  const chunks = []
  const size = 80
  for (let i = 0; i < coded.length; i += size) {
    const slice = coded.slice(i, i + size)
    chunks.push(`insert into public.bookings (
  code, agent_slug, agent_name, agent_ref, program, date,
  park_fee, canoe, adults, children, infants, tour_leaders,
  lead_guest, pickup_zone, pickup_hotel, room_number, note,
  cash_on_tour, transfer_extra_charge,
  private_transfer_vehicle, private_transfer_price,
  private_driver_name, private_driver_phone,
  pickup_time, status, late_change_fee
) values
${slice.map((b) => bookingSqlRow(b, b.code)).join(',\n')};`)
  }
  const ppCount = coded.filter((b) => b.program === 'PP').length
  const jbCount = coded.filter((b) => b.program === 'James Bond').length
  return `-- Feb–Aug'26 Goodday Speedboat history → PP + James Bond
-- ${coded.length} rows (${ppCount} PP, ${jbCount} JB), ${DATE_FROM}–${DATE_TO}.
-- Safe to re-run: replaces bookings only on this date range.
-- Blank agents → Booking Window. Missing names → TBA. Notes kept from sheet.

insert into public.agents (slug, name, country, status) values
${agentSql}
on conflict (slug) do update set
  name = excluded.name,
  status = excluded.status;

insert into public.pickup_zones (name, time, pending, sort_order) values
${zoneSql}
on conflict (name) do update set
  time = excluded.time,
  pending = excluded.pending,
  sort_order = excluded.sort_order;

delete from public.check_in_services where date between '${DATE_FROM}' and '${DATE_TO}';
delete from public.check_in_enrollments where date between '${DATE_FROM}' and '${DATE_TO}';
delete from public.check_in_attendance where date between '${DATE_FROM}' and '${DATE_TO}';
delete from public.check_in_payments where date between '${DATE_FROM}' and '${DATE_TO}';
delete from public.check_in_guest_edits where date between '${DATE_FROM}' and '${DATE_TO}';
delete from public.check_in_sequences where date between '${DATE_FROM}' and '${DATE_TO}';
delete from public.boat_assignments
where booking_code in (select code from public.bookings where date between '${DATE_FROM}' and '${DATE_TO}');
delete from public.van_assignments
where booking_code in (select code from public.bookings where date between '${DATE_FROM}' and '${DATE_TO}');
delete from public.bookings where date between '${DATE_FROM}' and '${DATE_TO}';

${chunks.join('\n\n')}
`
}

function loadEnv() {
  const envPath = path.join(SCRIPT_DIR, '../.env.local')
  return Object.fromEntries(
    fs
      .readFileSync(envPath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const i = line.indexOf('=')
        return [line.slice(0, i), line.slice(i + 1).replace(/^["']|["']$/g, '')]
      }),
  )
}

async function apply(bookings) {
  const env = loadEnv()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const { error: authErr } = await supabase.auth.signInWithPassword({
    email: 'gday-staff-admin@internal.gday',
    password: env.STAFF_SUPABASE_PASSWORD,
  })
  if (authErr) throw new Error('auth: ' + authErr.message)

  const agents = collectAgents(bookings)
  const zones = collectZones(bookings)
  const coded = assignCodes(bookings)

  const { error: agentErr } = await supabase.from('agents').upsert(
    agents.map((a) => ({ slug: a.slug, name: a.name, country: '', status: 'Active' })),
    { onConflict: 'slug' },
  )
  if (agentErr) throw new Error('agents: ' + agentErr.message)

  const { error: zoneErr } = await supabase.from('pickup_zones').upsert(
    zones.map((z) => ({
      name: z.name,
      time: z.time,
      pending: z.pending,
      sort_order: z.sort,
    })),
    { onConflict: 'name' },
  )
  if (zoneErr) throw new Error('zones: ' + zoneErr.message)

  const { data: existing, error: existErr } = await supabase
    .from('bookings')
    .select('code')
    .gte('date', DATE_FROM)
    .lte('date', DATE_TO)
  if (existErr) throw new Error('existing: ' + existErr.message)
  const oldCodes = (existing || []).map((r) => r.code)

  for (const table of [
    'check_in_services',
    'check_in_enrollments',
    'check_in_attendance',
    'check_in_payments',
    'check_in_guest_edits',
    'check_in_sequences',
  ]) {
    const { error } = await supabase.from(table).delete().gte('date', DATE_FROM).lte('date', DATE_TO)
    if (error && !/schema cache|does not exist|Could not find/i.test(error.message)) {
      throw new Error(`${table}: ${error.message}`)
    }
  }

  if (oldCodes.length) {
    for (const table of ['boat_assignments', 'van_assignments']) {
      for (let i = 0; i < oldCodes.length; i += 80) {
        const { error } = await supabase
          .from(table)
          .delete()
          .in('booking_code', oldCodes.slice(i, i + 80))
        if (error && !/schema cache|does not exist/i.test(error.message)) {
          throw new Error(`${table}: ${error.message}`)
        }
      }
    }
    const { error: delErr } = await supabase
      .from('bookings')
      .delete()
      .gte('date', DATE_FROM)
      .lte('date', DATE_TO)
    if (delErr) throw new Error('delete bookings: ' + delErr.message)
    console.log('cleared', oldCodes.length, 'existing history bookings')
  }

  const rows = coded.map((b) => ({
    code: b.code,
    agent_slug: b.agentSlug,
    agent_name: b.agentName,
    agent_ref: b.agentRef,
    program: b.program,
    date: b.date,
    park_fee: b.parkFee,
    canoe: b.canoe,
    adults: b.adults,
    children: b.children,
    infants: b.infants,
    tour_leaders: b.tourLeaders,
    lead_guest: b.leadGuest,
    pickup_zone: b.pickupZone,
    pickup_hotel: b.pickupHotel,
    room_number: b.roomNumber,
    note: b.note,
    cash_on_tour: b.cashOnTour,
    transfer_extra_charge: b.transferExtraCharge,
    private_transfer_vehicle: b.privateTransferVehicle,
    private_transfer_price: b.privateTransferPrice,
    private_driver_name: b.privateDriverName,
    private_driver_phone: b.privateDriverPhone,
    pickup_time: b.pickupTime,
    status: b.status,
    late_change_fee: b.lateChangeFee,
  }))

  for (let i = 0; i < rows.length; i += 40) {
    const { error } = await supabase.from('bookings').insert(rows.slice(i, i + 40))
    if (error) throw new Error(`insert ${i}: ${error.message}`)
    console.log(`inserted ${Math.min(i + 40, rows.length)}/${rows.length}`)
  }
  return coded
}

if (process.argv[1] && process.argv[1].includes('import-history-2026-speedboat')) {
  const { bookings, skipped } = parseAllHistory()
  const byMonth = {}
  let pp = 0
  let jb = 0
  for (const b of bookings) {
    const m = b.date.slice(0, 7)
    byMonth[m] = byMonth[m] || { PP: 0, JB: 0 }
    if (b.program === 'James Bond') {
      byMonth[m].JB += 1
      jb += 1
    } else {
      byMonth[m].PP += 1
      pp += 1
    }
  }
  console.log('parsed', bookings.length, 'bookings ·', pp, 'PP ·', jb, 'JB')
  for (const [m, n] of Object.entries(byMonth).sort()) {
    console.log(`  ${m}: PP ${n.PP} · JB ${n.JB} · total ${n.PP + n.JB}`)
  }
  const agents = [...new Set(bookings.map((b) => b.agentName))].sort()
  console.log('\nAgents:', agents.join(' · '))
  const tba = bookings.filter((b) => b.leadGuest === 'TBA')
  const groupish = bookings.filter((b) => /^group$/i.test(b.leadGuest.trim()))
  const cancelled = bookings.filter((b) => b.status === 'Cancelled')
  const noVoucher = bookings.filter((b) => !b.agentRef)
  console.log('TBA names:', tba.length)
  console.log('Guest name GROUP:', groupish.length, groupish.slice(0, 8).map((b) => `${b.date} ${b.agentName}`))
  console.log('Cancelled:', cancelled.length)
  console.log('Empty voucher:', noVoucher.length)
  const reviewSkips = skipped.filter((s) => !/duplicate sheet|bad sheet/.test(s.reason) || true)
  const interesting = skipped.filter((s) => s.reason === 'zero pax' || /bad sheet|duplicate/.test(s.reason))
  if (interesting.length) {
    console.log('\nSkipped/review:')
    for (const s of interesting.slice(0, 30)) {
      console.log(`  ${s.month || ''} ${s.date || ''} ${s.reason} ${s.sheetName || s.guest || ''}`)
    }
    if (interesting.length > 30) console.log(`  … +${interesting.length - 30} more`)
  }

  fs.writeFileSync(SQL_OUT, buildSql(bookings))
  console.log('\nwrote', SQL_OUT)

  if (process.argv.includes('--apply')) {
    await apply(bookings)
    console.log('applied to Supabase')
  }
}
