/**
 * SERVER-ONLY: fetch a guest booking using the Supabase service role.
 *
 * Used by app/check-in/page.tsx (Server Component) to read the booking
 * before the guest's phone has authenticated, so the check-in page can
 * render instantly without a "Opening your check-in QR…" loading screen.
 *
 * Security notes:
 * - SUPABASE_SERVICE_ROLE_KEY must NEVER have a NEXT_PUBLIC_ prefix.
 * - This file is server-only (import 'server-only' guard below).
 * - The Booking object returned here contains NO financial / PII beyond
 *   what the guest already sees on their own check-in page (name, date,
 *   boat, van).  No auth credentials or payment data are exposed.
 * - Write operations (check-in submit) still require a valid guest session
 *   enforced via ensureGuestCheckInSession() → RLS.
 */
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { type Booking, type Program, type IncludeOption } from '@/lib/types'

// ---------------------------------------------------------------------------
// Service-role Supabase client — module-level singleton so the HTTP agent is
// reused across concurrent server renders.
// ---------------------------------------------------------------------------
let _client: ReturnType<typeof createClient> | null = null

function serviceClient() {
  if (_client) return _client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ?? ''
  if (!url || !key) return null
  _client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _client
}

// ---------------------------------------------------------------------------
// Safe type guards
// ---------------------------------------------------------------------------
function asProgram(v: unknown): Program {
  return v === 'James Bond' ? 'James Bond' : 'PP'
}
function asInclude(v: unknown): IncludeOption {
  return v === 'Not Included' ? 'Not Included' : 'Included'
}
function asIncludeOrNull(v: unknown): IncludeOption | null {
  if (v == null) return null
  return asInclude(v)
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Fetch a booking row by code using the service role (bypasses RLS).
 * Returns null if the code is invalid, the DB is unreachable, or env vars
 * are missing.  Callers must treat null as "invalid QR" and fall back to
 * the existing client-side auth flow.
 */
export async function fetchGuestBookingServer(code: string): Promise<Booking | null> {
  const trimmed = code.trim()
  if (!trimmed) return null

  const supabase = serviceClient()
  if (!supabase) return null

  try {
    const { data, error } = await supabase
      .from('bookings')
      .select(
        'code, agent_slug, agent_name, agent_ref, program, date, ' +
          'park_fee, canoe, adults, children, infants, tour_leaders, ' +
          'lead_guest, pickup_zone, pickup_hotel, room_number, note, ' +
          'cash_on_tour, transfer_extra_charge, ' +
          'private_transfer_vehicle, private_transfer_price, ' +
          'private_driver_name, private_driver_phone, pickup_time, status',
      )
      .eq('code', trimmed)
      .maybeSingle()

    if (error || !data) return null

    // The service-role client is not typed against the DB schema, so we cast
    // via unknown to access the raw row fields without TypeScript errors.
    const row = data as Record<string, unknown>
    const agentSlug = String(row.agent_slug ?? '')
    const ptv = row.private_transfer_vehicle
    const booking: Booking = {
      code: String(row.code ?? ''),
      agentSlug,
      agentName: String(row.agent_name ?? agentSlug),
      agentRef: String(row.agent_ref ?? ''),
      program: asProgram(row.program),
      date: String(row.date ?? '').slice(0, 10),
      parkFee: asInclude(row.park_fee),
      canoe: asIncludeOrNull(row.canoe),
      adults: Math.max(0, Number(row.adults) || 0),
      children: Math.max(0, Number(row.children) || 0),
      infants: Math.max(0, Number(row.infants) || 0),
      tourLeaders: Math.max(0, Number(row.tour_leaders) || 0),
      leadGuest: String(row.lead_guest ?? ''),
      pickupZone: String(row.pickup_zone ?? ''),
      pickupHotel: String(row.pickup_hotel ?? ''),
      roomNumber: String(row.room_number ?? ''),
      note: String(row.note ?? ''),
      cashOnTour: String(row.cash_on_tour ?? ''),
      transferExtraCharge: String(row.transfer_extra_charge ?? ''),
      privateTransferVehicle: ptv === 'Car' || ptv === 'Van' ? ptv : '',
      privateTransferPrice: String(row.private_transfer_price ?? ''),
      privateDriverName: String(row.private_driver_name ?? ''),
      privateDriverPhone: String(row.private_driver_phone ?? ''),
      pickupTime: String(row.pickup_time ?? ''),
      status:
        row.status === 'Cancelled'
          ? 'Cancelled'
          : row.status === 'Pending Pickup Time'
            ? 'Pending Pickup Time'
            : 'Confirmed',
    }

    return booking
  } catch {
    // Network error, timeout, etc. — fall back to client-side auth flow.
    return null
  }
}
