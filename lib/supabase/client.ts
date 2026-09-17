import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

let browserClient: SupabaseClient | null = null

export function hasSupabaseConfig() {
  return Boolean(url && anonKey)
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!url || !anonKey) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  if (!browserClient) {
    browserClient = createClient(url, anonKey)
  }
  return browserClient
}
