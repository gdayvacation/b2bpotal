import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * Paged select past the 1000-row cap.
 * Pass `columns` to restrict the projection (default `'*'`).
 * Order by the primary key so pages never overlap.
 */
export async function selectAllPaged<T>(
  table: string,
  orderBy: string[],
  columns = '*',
): Promise<{ data: T[] | null; error: { message: string } | null }> {
  const supabase = getSupabaseBrowserClient()
  const pageSize = 1000
  const all: T[] = []
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from(table).select(columns)
    for (const column of orderBy) query = query.order(column, { ascending: true })
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) return { data: null, error }
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < pageSize) break
  }
  return { data: all, error: null }
}
