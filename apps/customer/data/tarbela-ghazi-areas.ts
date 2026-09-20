import { normalizeLocality } from "@italian-pizza/shared/location"
import type { AreaGroupId, LocationArea } from "@/types"

export const areaGroupLabels: Record<AreaGroupId, string> = {
  "ghazi-nearby": "Ghazi & Tarbela nearby",
  "reservoir-side": "Tarbela Dam & reservoir side",
  "extended-belt": "Nearby & extended belt",
}

const areas: LocationArea[] = [
  { id: "ghazi", label: "Ghazi", aliases: [], group: "ghazi-nearby" },
  { id: "hamlet-colony", label: "Hamlet Colony", aliases: ["Hamlet"], group: "ghazi-nearby" },
  { id: "sobra-city", label: "Sobra City", aliases: ["Subra City", "Subra", "Sobra"], group: "ghazi-nearby" },
  { id: "essa", label: "Essa", aliases: ["Isa"], group: "ghazi-nearby" },
  { id: "qazipur", label: "Qazipur", aliases: [], group: "ghazi-nearby" },
  { id: "khalo", label: "Khalo", aliases: ["Khalu"], group: "ghazi-nearby" },
  { id: "bhai", label: "Bhai", aliases: ["Bai"], group: "ghazi-nearby" },
  { id: "jammun", label: "Jammun", aliases: [], group: "ghazi-nearby" },
  { id: "jalu", label: "Jalu", aliases: ["Jolu"], group: "ghazi-nearby" },
  { id: "hassanpur", label: "Hassanpur", aliases: ["Hasanpur"], group: "ghazi-nearby" },
  { id: "bharwasa", label: "Bharwasa", aliases: [], group: "ghazi-nearby" },
  { id: "gahara", label: "Gahara", aliases: [], group: "ghazi-nearby" },
  { id: "khairbara", label: "Khairbara", aliases: [], group: "ghazi-nearby", additionalGroups: ["extended-belt"] },
  { id: "kohtehra", label: "Kohtehra", aliases: ["Katehra"], group: "ghazi-nearby" },
  { id: "pipliala", label: "Pipliala", aliases: ["Pipliwala"], group: "ghazi-nearby" },
  { id: "salam-khand", label: "Salam Khand", aliases: [], group: "ghazi-nearby" },
  { id: "dhok-dustom", label: "Dhok Dustom", aliases: [], group: "ghazi-nearby" },
  { id: "dhok-dakmarai", label: "Dhok Dakmarai", aliases: [], group: "ghazi-nearby" },
  { id: "aldo", label: "Aldo", aliases: [], group: "ghazi-nearby" },
  { id: "jabbi", label: "Jabbi", aliases: [], group: "ghazi-nearby" },
  { id: "mian-dheri", label: "Mian Dheri", aliases: [], group: "ghazi-nearby" },
  { id: "nakarchi", label: "Nakarchi", aliases: [], group: "ghazi-nearby" },
  { id: "pontiya", label: "Pontiya", aliases: [], group: "ghazi-nearby" },
  { id: "garhi", label: "Garhi", aliases: [], group: "ghazi-nearby" },
  { id: "sheikh-chuhr", label: "Sheikh Chuhr", aliases: [], group: "ghazi-nearby" },
  { id: "gwari", label: "Gwari", aliases: [], group: "ghazi-nearby" },
  { id: "sokra", label: "Sokra", aliases: [], group: "ghazi-nearby" },
  { id: "qutb-bandi", label: "Qutb Bandi", aliases: [], group: "ghazi-nearby" },
  { id: "shahid-baba", label: "Shahid Baba", aliases: [], group: "ghazi-nearby" },
  { id: "tms-colony", label: "TMS Colony", aliases: [], group: "ghazi-nearby" },
  { id: "tro-colony", label: "TRO Colony", aliases: [], group: "ghazi-nearby" },
  { id: "preparation-for-life-colony", label: "Preparation For Life Colony", aliases: [], group: "ghazi-nearby" },
  { id: "sobra-city-colony", label: "Sobra City Colony", aliases: [], group: "ghazi-nearby" },
  { id: "tarbela-dam", label: "Tarbela Dam", aliases: [], group: "reservoir-side" },
  { id: "bara", label: "Bara", aliases: [], group: "reservoir-side" },
  { id: "dal", label: "Dal", aliases: [], group: "reservoir-side" },
  { id: "mehran-colony", label: "Mehran Colony", aliases: [], group: "reservoir-side" },
  { id: "mohat-nawan", label: "Mohat Nawan", aliases: [], group: "reservoir-side" },
  { id: "mohat-purana", label: "Mohat Purana", aliases: [], group: "reservoir-side" },
  { id: "dhen-baba", label: "Dhen Baba", aliases: [], group: "reservoir-side" },
  { id: "gandaf", label: "Gandaf", aliases: [], group: "reservoir-side" },
  { id: "gandaf-camp", label: "Gandaf Camp", aliases: [], group: "reservoir-side" },
  { id: "adalat-colony", label: "Adalat Colony", aliases: [], group: "reservoir-side" },
  { id: "subra-colony", label: "Subra Colony", aliases: [], group: "reservoir-side" },
  { id: "bul-dheri", label: "Bul Dheri", aliases: [], group: "reservoir-side" },
  { id: "kukukh-choha", label: "Kukukh Choha", aliases: [], group: "reservoir-side" },
  { id: "gari-maira", label: "Gari Maira", aliases: [], group: "reservoir-side" },
  { id: "kiara", label: "Kiara", aliases: [], group: "reservoir-side" },
  { id: "right-bank-colony", label: "Right Bank Colony", aliases: [], group: "reservoir-side" },
  { id: "batakara", label: "Batakara", aliases: [], group: "reservoir-side" },
  { id: "pehur", label: "Pehur", aliases: ["Pehure"], group: "reservoir-side" },
  { id: "labadam", label: "Labadam", aliases: [], group: "reservoir-side" },
  { id: "balongi", label: "Balongi", aliases: [], group: "reservoir-side" },
  { id: "galla", label: "Galla", aliases: [], group: "reservoir-side" },
  { id: "kabbal", label: "Kabbal", aliases: [], group: "reservoir-side" },
  { id: "kalabat", label: "Kalabat", aliases: ["Khalabat"], group: "reservoir-side" },
  { id: "zarobi", label: "Zarobi", aliases: ["Zarobai"], group: "extended-belt" },
  { id: "topi", label: "Topi", aliases: [], group: "extended-belt" },
  { id: "kangra-colony", label: "Kangra Colony", aliases: [], group: "extended-belt" },
  { id: "khalabat-township", label: "Khalabat Township", aliases: [], group: "extended-belt" },
  { id: "sirikot", label: "Sirikot", aliases: [], group: "extended-belt" },
  { id: "julahri", label: "Julahri", aliases: [], group: "extended-belt" },
  { id: "bandi", label: "Bandi", aliases: [], group: "extended-belt" },
  { id: "baghdara", label: "Baghdara", aliases: [], group: "extended-belt" },
  { id: "bhada", label: "Bhada", aliases: [], group: "extended-belt" },
  { id: "khari-gali", label: "Khari Gali", aliases: [], group: "extended-belt" },
  { id: "ladha", label: "Ladha", aliases: [], group: "extended-belt" },
  { id: "bhera", label: "Bhera", aliases: [], group: "extended-belt" },
  { id: "darwaza-gali", label: "Darwaza Gali", aliases: [], group: "extended-belt" },
  { id: "kheri", label: "Kheri", aliases: [], group: "extended-belt" },
  { id: "suraj", label: "Suraj", aliases: [], group: "extended-belt" },
  { id: "niamat-khan", label: "Niamat Khan", aliases: [], group: "extended-belt" },
  { id: "kakotri", label: "Kakotri", aliases: [], group: "extended-belt" },
  { id: "nurpur", label: "Nurpur", aliases: [], group: "extended-belt" },
  { id: "pirani", label: "Pirani", aliases: [], group: "extended-belt" },
  { id: "band-pir-dad", label: "Band Pir Dad", aliases: [], group: "extended-belt" },
  { id: "makhan", label: "Makhan", aliases: [], group: "extended-belt" },
  { id: "baladhar", label: "Baladhar", aliases: [], group: "extended-belt" },
  { id: "rehana", label: "Rehana", aliases: [], group: "extended-belt" },
  { id: "bhuti", label: "Bhuti", aliases: [], group: "extended-belt" },
  { id: "mohri", label: "Mohri", aliases: [], group: "extended-belt" },
  { id: "bagra", label: "Bagra", aliases: [], group: "extended-belt" },
]

export const tarbelaGhaziAreas = areas

export function normalizeAreaSearch(value: string) {
  return normalizeLocality(value)
}

export function searchAreas(query: string) {
  const normalizedQuery = normalizeAreaSearch(query)
  if (!normalizedQuery) return tarbelaGhaziAreas
  const exactMatches = tarbelaGhaziAreas.filter((area) => [area.label, ...area.aliases].some((name) => normalizeAreaSearch(name) === normalizedQuery))
  if (exactMatches.length > 0) return exactMatches
  return tarbelaGhaziAreas.filter((area) => [area.label, ...area.aliases].some((name) => normalizeAreaSearch(name).includes(normalizedQuery)))
}

export type AreaCandidate = {
  source: string
  value: string | null | undefined
}

export type AreaMatch = {
  area: LocationArea
  sourceField: string
  confidence: "exact-canonical" | "exact-alias" | "formatted-token"
}

const candidateSourceWeight: Record<string, number> = {
  neighbourhood: 1000,
  suburb: 980,
  quarter: 960,
  village: 940,
  district: 920,
  town: 900,
  name: 880,
  municipality: 160,
  street: 840,
  address_line1: 820,
  address_line2: 800,
  "formatted-part": 780,
  formatted: 760,
  county: 180,
  city: 700,
}

const ghaziSpecificSources = new Set(["neighbourhood", "suburb", "quarter", "village", "name"])
const tokenOnlySources = new Set(["street", "address_line1", "address_line2", "formatted-part", "formatted"])

function containsWholePhrase(candidate: string, areaName: string) {
  if (areaName.length < 4 && !areaName.includes(" ")) return false
  return ` ${candidate} `.includes(` ${areaName} `)
}

export function matchAreaCandidates(candidates: AreaCandidate[], supportedAreas: LocationArea[] = tarbelaGhaziAreas): AreaMatch | undefined {
  let best: { match: AreaMatch; score: number; nameLength: number } | undefined
  const normalizedAreaNames = supportedAreas.flatMap((area) => [
    { area, normalizedName: normalizeAreaSearch(area.label), alias: false },
    ...area.aliases.map((alias) => ({ area, normalizedName: normalizeAreaSearch(alias), alias: true })),
  ])

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeAreaSearch(candidate.value ?? "")
    if (!normalizedCandidate) continue

    for (const entry of normalizedAreaNames) {
      const exact = normalizedCandidate === entry.normalizedName
      const contained = !exact && containsWholePhrase(normalizedCandidate, entry.normalizedName)
      if (!entry.normalizedName || (!exact && !contained)) continue
      if (candidate.source === "county" || candidate.source === "district") continue

      if (entry.area.id === "ghazi" && !ghaziSpecificSources.has(candidate.source)) continue

      const tokenMatch = contained || tokenOnlySources.has(candidate.source)
      const confidence: AreaMatch["confidence"] = tokenMatch
        ? "formatted-token"
        : entry.alias ? "exact-alias" : "exact-canonical"
      const broadSource = candidate.source === "city" || candidate.source === "county"
      const methodWeight = broadSource ? 0 : tokenMatch ? 1000 : entry.alias ? 2000 : 3000
      const score = (entry.area.id === "ghazi" ? 0 : 1000000) + (candidateSourceWeight[candidate.source] ?? 300) * 100 + methodWeight + Math.min(entry.normalizedName.length, 40)
      const proposed = { match: { area: entry.area, sourceField: candidate.source, confidence }, score, nameLength: entry.normalizedName.length }

      if (!best || proposed.score > best.score || (proposed.score === best.score && proposed.nameLength > best.nameLength)) {
        best = proposed
      }
    }
  }

  return best?.match
}

export function getArea(areaId: string | null) {
  return tarbelaGhaziAreas.find((area) => area.id === areaId)
}
