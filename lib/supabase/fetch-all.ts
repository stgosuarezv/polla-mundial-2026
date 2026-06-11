/**
 * PostgREST silently caps every select at 1,000 rows (Supabase default
 * max-rows). Any query that can return more — e.g. all predictions for a
 * round: 50 players × 24 matches = 1,200 — must paginate with .range().
 *
 * The closure must apply a stable .order() so pages don't skip or
 * duplicate rows.
 */

const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  buildQuery: (
    from: number,
    to: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ data: T[]; error: string | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery(from, from + PAGE_SIZE - 1);
    if (error) return { data: all, error: error.message };
    all.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) return { data: all, error: null };
  }
}
