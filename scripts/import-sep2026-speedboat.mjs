/**
 * Parse September'26 Goodday Speedboat.xlsx → Phi Phi bookings.
 * Usage: node scripts/import-sep2026-speedboat.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))

const WORKBOOK = path.join(
  process.env.HOME || '',
  "Downloads/September'26 Goodday Speedboat.xlsx",
)
const SQL_OUT = path.join(SCRIPT_DIR, '../supabase/seed-sep2026-pp-excel.sql')

const PP_ADULT_PARK = 400
const PP_CHILD_PARK = 200

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
    .replace(/\bcxl\b/gi, '')
    .replace(/[/\-–|,]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (leftover && leftover.length > 1) parts.push(leftover)

  if (/no\s*tran/i.test(hotelRaw) && !parts.some((p) => /no transfer/i.test(p))) {
    /* hotel already mapped; skip */
  }
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

export function parseWorkbook(filePath = WORKBOOK) {
  const wb = XLSX.readFile(filePath, { raw: false })
  const bookings = []

  for (const sheetName of wb.SheetNames) {
    const day = Number(sheetName)
    if (!Number.isInteger(day) || day < 1 || day > 30) continue
    const date = `2026-09-${String(day).padStart(2, '0')}`
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], {
      header: 1,
      defval: '',
      raw: false,
    })

    for (const row of rows) {
      if (isHeader(row)) continue
      const agentRaw = cell(row, 1)
      const voucher = cell(row, 2).replace(/^-+$/, '')
      const guest = cell(row, 3)
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

      if (!guest && !voucher && !agentRaw) continue
      if (!guest || isJunkGuest(guest)) continue
      if (adults + children + infants + tourLeaders < 1) continue

      const agentName = normalizeAgent(agentRaw)
      const pickupZone = normalizeZone(zoneRaw, hotelRaw)
      const pickupHotel = cleanHotel(hotelRaw)
      const parkFee =
        parkExcluded(remark) && !parkIncludedRemark(remark) ? 'Not Included' : 'Included'
      const parkTotal = adults * PP_ADULT_PARK + children * PP_CHILD_PARK
      const cotNum = parseCotAmount(cotRaw)
      const cashOnTour =
        cotNum > 0 && !(parkFee === 'Not Included' && cotNum === parkTotal)
          ? formatThb(cotNum)
          : ''
      const transferExtra = extraChargeFromRemark(remark)
      const pickupTime = mapPickupTime(pickupZone, pickup) || 'Awaiting pickup time'
      const priv = mapPrivate(pickupZone, van, remark)
      const note = noteParts({ wa, remark, van, extra, hotelRaw })

      bookings.push({
        date,
        agentSlug: slugify(agentName),
        agentName,
        agentRef: voucher === '-' ? '' : voucher,
        program: 'PP',
        parkFee,
        canoe: null,
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

  return bookings
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
  const coded = bookings.map((b, i) => ({
    ...b,
    code: `PP2609-${String(i + 1).padStart(4, '0')}`,
  }))

  const agentSql = agents
    .map(
      (a) =>
        `  (${sqlStr(a.slug)}, ${sqlStr(a.name)}, '', 'Active')`,
    )
    .join(',\n')

  const zoneSql = zones
    .map(
      (z) =>
        `  (${sqlStr(z.name)}, ${sqlStr(z.time)}, ${z.pending}, ${z.sort})`,
    )
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

  return `-- Phi Phi bookings from September'26 Goodday Speedboat.xlsx
-- ${coded.length} rows, 1–30 Sept 2026. Safe to re-run (replaces PP on these dates).
-- Park-fee-only COT is stored as park_fee = Not Included, not duplicated in cash_on_tour.

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

delete from public.check_in_services
where date between '2026-09-01' and '2026-09-30';
delete from public.check_in_enrollments
where date between '2026-09-01' and '2026-09-30';
delete from public.check_in_attendance
where date between '2026-09-01' and '2026-09-30';
delete from public.check_in_payments
where date between '2026-09-01' and '2026-09-30';
delete from public.check_in_guest_edits
where date between '2026-09-01' and '2026-09-30';
delete from public.check_in_sequences
where date between '2026-09-01' and '2026-09-30';

delete from public.boat_assignments
where booking_code in (
  select code from public.bookings
  where date between '2026-09-01' and '2026-09-30' and program = 'PP'
);
delete from public.van_assignments
where booking_code in (
  select code from public.bookings
  where date between '2026-09-01' and '2026-09-30' and program = 'PP'
);

delete from public.bookings
where date between '2026-09-01' and '2026-09-30' and program = 'PP';

${chunks.join('\n\n')}

select date, count(*) as bookings,
  sum(adults) as adl, sum(children) as chd, sum(infants) as inf, sum(tour_leaders) as foc
from public.bookings
where date between '2026-09-01' and '2026-09-30' and program = 'PP'
group by date
order by date;
`
}

function loadEnv() {
  const envPath = path.join(SCRIPT_DIR, '../.env.local')
  const env = Object.fromEntries(
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
  return env
}

async function apply(bookings) {
  const env = loadEnv()
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const agents = collectAgents(bookings)
  const zones = collectZones(bookings)
  const coded = bookings.map((b, i) => ({
    ...b,
    code: `PP2609-${String(i + 1).padStart(4, '0')}`,
  }))

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
    .gte('date', '2026-09-01')
    .lte('date', '2026-09-30')
    .eq('program', 'PP')
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
    const { error } = await supabase
      .from(table)
      .delete()
      .gte('date', '2026-09-01')
      .lte('date', '2026-09-30')
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
      .gte('date', '2026-09-01')
      .lte('date', '2026-09-30')
      .eq('program', 'PP')
    if (delErr) throw new Error('delete bookings: ' + delErr.message)
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

  for (let i = 0; i < rows.length; i += 80) {
    const { error } = await supabase.from('bookings').insert(rows.slice(i, i + 80))
    if (error) throw new Error(`insert ${i}: ${error.message}`)
    console.log(`inserted ${Math.min(i + 80, rows.length)}/${rows.length}`)
  }

  return coded
}

if (process.argv[1] && process.argv[1].includes('import-sep2026-speedboat')) {
  const bookings = parseWorkbook()
  const byDate = {}
  for (const b of bookings) {
    byDate[b.date] = (byDate[b.date] || 0) + 1
  }
  console.log('parsed', bookings.length, 'bookings')
  console.log(
    Object.entries(byDate)
      .map(([d, n]) => `${d.slice(8)}:${n}`)
      .join(' '),
  )
  fs.writeFileSync(SQL_OUT, buildSql(bookings))
  console.log('wrote', SQL_OUT)

  if (process.argv.includes('--apply')) {
    await apply(bookings)
    console.log('applied to Supabase')
  }
}
