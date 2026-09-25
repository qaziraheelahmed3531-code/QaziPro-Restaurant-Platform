import { NextRequest, NextResponse } from "next/server"
import { normalizeGeoapifyPlace } from "@italian-pizza/shared/geoapify"
import { validPoint } from "@italian-pizza/shared/location"
import { getPlatformContext } from "@/lib/auth"

type ProviderResponse = { results?: Record<string, unknown>[] }

export async function GET(request: NextRequest) {
  const context = await getPlatformContext()
  if (!context || (!context.permissions.includes("branches.manage") && !context.permissions.includes("onboarding.manage"))) return NextResponse.json({ error: "Location access denied." }, { status: 403 })
  const key = process.env.GEOAPIFY_API_KEY?.trim()
  if (!key) return NextResponse.json({ error: "Location search is not configured. Enter the address manually and configure the map later." }, { status: 503 })
  const mode = request.nextUrl.searchParams.get("mode") === "reverse" ? "reverse" : "autocomplete"
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? ""
  const countryCode = request.nextUrl.searchParams.get("countryCode")?.trim().toLowerCase() ?? "pk"
  const latitude = Number(request.nextUrl.searchParams.get("latitude"))
  const longitude = Number(request.nextUrl.searchParams.get("longitude"))
  if (mode === "autocomplete" && (query.length < 2 || query.length > 200)) return NextResponse.json({ error: "Enter at least two address characters." }, { status: 400 })
  if (mode === "reverse" && !validPoint({ latitude, longitude })) return NextResponse.json({ error: "Choose a valid map point." }, { status: 400 })
  const url = new URL(`https://api.geoapify.com/v1/geocode/${mode}`)
  url.searchParams.set("apiKey", key)
  url.searchParams.set("format", "json")
  url.searchParams.set("lang", "en")
  url.searchParams.set("limit", mode === "reverse" ? "1" : "10")
  if (mode === "reverse") {
    url.searchParams.set("lat", String(latitude))
    url.searchParams.set("lon", String(longitude))
  } else {
    url.searchParams.set("text", query)
    if (/^[a-z]{2}$/.test(countryCode)) url.searchParams.set("filter", `countrycode:${countryCode}`)
  }
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.any([request.signal, AbortSignal.timeout(10_000)]) })
    if (!response.ok) throw new Error("provider")
    const payload = await response.json() as ProviderResponse
    const seen = new Set<string>()
    const candidates = (payload.results ?? []).flatMap((row) => {
      const candidate = normalizeGeoapifyPlace(row)
      if (!candidate || seen.has(candidate.id)) return []
      seen.add(candidate.id)
      return [candidate]
    })
    return NextResponse.json({ candidates }, { headers: { "Cache-Control": "private, no-store" } })
  } catch {
    return NextResponse.json({ error: "Location search is temporarily unavailable. Enter the address manually or retry." }, { status: 502 })
  }
}
