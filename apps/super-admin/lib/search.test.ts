import { describe, expect, it } from "vitest"
import { normalizeSearchQuery, searchSources } from "./search"
describe("bounded scoped search", () => {
  it("removes PostgREST expression delimiters", () => expect(normalizeSearchQuery(' a%,id.eq.(1)_ ')).toBe('aid.eq.1'))
  it("limits query length", () => expect(normalizeSearchQuery('x'.repeat(200))).toHaveLength(80))
  it("preserves international names", () => expect(normalizeSearchQuery(' Café لاہور ')).toBe('Café لاہور'))
  it("every source declares a permission", () => expect(searchSources.every(s => s.permission.length > 0)).toBe(true))
})
