import { rpcMessage } from '@/lib/rpc-error'
import { getSupabaseBrowserClient, hasSupabaseConfig } from '@/lib/supabase/client'

export async function fetchGuestQrToken(bookingCode: string): Promise<string> {
  if (!hasSupabaseConfig()) throw new Error('Supabase is not configured.')
  const { data, error } = await getSupabaseBrowserClient().rpc('portal_guest_qr_token', {
    p_code: bookingCode,
  })
  if (error) throw new Error(rpcMessage(error, 'Could not create check-in QR.'))
  const token = String(data ?? '').trim()
  if (!token) throw new Error('Could not create check-in QR.')
  return token
}
