import { getSupabaseBrowserClient } from '@/lib/supabase/client'

/**
 * PERF sprint-5: run async tasks with a concurrency cap instead of firing all of them at once
 * via Promise.all. On the Free plan, PostgREST holds only a 10-connection pool to Postgres. A
 * single check-in sync used to fan out 8-11 table queries simultaneously; with several staff
 * tabs open and debounced syncs landing in the same ~30s window, that could momentarily demand
 * 40+ connections at once and starve the pool (seen as "Thread killed by timeout manager" /
 * PostgREST restarts during guest rush). Capping concurrency smooths that burst out over time
 * while keeping total request count and data identical — same per-request payload size as
 * before, just fewer in flight at any instant.
 */
export async function runWithConcurrencyLimit<T extends readonly (() => Promise<unknown>)[]>(
  tasks: T,
  limit = 4,
): Promise<{ [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const results: unknown[] = new Array(tasks.length)
  let nextIndex = 0

  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      if (index >= tasks.length) return
      results[index] = await tasks[index]()
    }
  }

  const workerCount = Math.max(1, Math.min(limit, tasks.length))
  await Promise.all(Array.from({ length: workerCount }, () => worker()))
  return results as { [K in keyof T]: Awaited<ReturnType<T[K]>> }
}

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
