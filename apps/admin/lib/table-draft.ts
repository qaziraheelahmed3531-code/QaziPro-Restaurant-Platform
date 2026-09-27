/** UX validation mirrors restaurant_tables checks; database/RLS remain authoritative. */
export function parseTableDraft(input: { name: string; code: string; seats: string }):
  | { ok: true; value: { name: string; code: string; seats: number } }
  | { ok: false; error: string } {
  const name = input.name.trim()
  const code = input.code.trim().toUpperCase()
  const seats = Number(input.seats)
  if (!name || name.length > 80) return { ok: false, error: "Enter a table name between 1 and 80 characters." }
  if (!code || code.length > 40) return { ok: false, error: "Enter a table code between 1 and 40 characters." }
  if (!Number.isInteger(seats) || seats < 1 || seats > 100) return { ok: false, error: "Enter a whole number of seats between 1 and 100." }
  return { ok: true, value: { name, code, seats } }
}
