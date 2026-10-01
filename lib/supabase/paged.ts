import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/** Whole-table `select('*')` paged past the 1000-row cap. Order by the primary key so pages never overlap. */
export async function selectAllPaged<T>(
  table: string,
  orderBy: string[],
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const supabase = getSupabaseBrowserClient()
  const pageSize = 1000
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select('*')
    for (const column of orderBy) query = query.order(column, { ascending: true })
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return { data: all, error: null }
}
