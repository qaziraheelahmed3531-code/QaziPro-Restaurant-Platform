import { NextResponse } from "next/server"
import { getPlatformContext } from "@/lib/auth"
import { createClient } from "@/lib/supabase/server"
import { normalizeSearchQuery, searchSources, type SearchResult } from "@/lib/search"

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store" }
  const context = await getPlatformContext()
  if (!context) return NextResponse.json({ error: "Sign in with an authorized platform account." }, { status: 401, headers })
  const params = new URL(request.url).searchParams
  const query = normalizeSearchQuery(params.get("q") ?? "")
  if (query.length < 2) return NextResponse.json({ results: [], hasMore: false }, { headers })
  const page = Math.min(100, Math.max(0, Math.floor(Number(params.get("page")) || 0)))
  const supabase = await createClient()
  const sources = searchSources.filter(source => context.permissions.includes(source.permission))
  try {
    const groups = await Promise.all(sources.map(async source => {
      let builder = supabase.from(String(source.table)).select(String(source.fields))
      builder = source.group === "Owners" ? builder.or(`owner_name.ilike.%${query}%,owner_email.ilike.%${query}%`) : builder.ilike(source.filter, `%${query}%`)
      const { data, error } = await builder.order("id").range(page * 5, page * 5 + 5)
      if (error) throw new Error("Search source unavailable")
      const records = (data ?? []) as unknown as Record<string, unknown>[]
      return { hasMore: records.length > 5, results: records.slice(0, 5).map(row => ({
        id: `${source.table}:${row.id}`, group: source.group, label: String(row[source.label] ?? "Unnamed record"), detail: String(row[source.detail] ?? ""),
        href: source.group === "Tasks" ? "/tasks" : source.group === "Support" ? "/support" : !context.permissions.includes("restaurants.view") ? `/${source.group.toLowerCase()}` : `/restaurants/${source.table === "businesses" ? row.id : row.business_id}${source.section ? `?tab=${source.section}` : ""}`,
      } satisfies SearchResult)) }
    }))
    return NextResponse.json({ results: groups.flatMap(group => group.results), hasMore: groups.some(group => group.hasMore) }, { headers })
  } catch {
    return NextResponse.json({ error: "Search is temporarily unavailable. Try again." }, { status: 503, headers })
  }
}
