import { describe, expect, it } from "vitest"
import sharp from "sharp"
import { normalizeBrandingImage } from "./branding-image"
import { brandingAssetUrl } from "./branding-contract"
describe("platform branding safety", () => {
  it.each(["../secret", "https://evil.test/a.png", "platform/bad.svg", "", null])("rejects unsafe asset paths", path => expect(brandingAssetUrl(path, "https://project.supabase.co")).toBeNull())
  it("uses the configured storage origin", () => expect(brandingAssetUrl("platform/12345678-1234-1234-1234-123456789012.png", "https://project.supabase.co")).toContain("/storage/v1/object/public/platform-branding/platform/"))
  it("rejects SVG before parsing", async () => await expect(normalizeBrandingImage(new File(['<svg/>'], 'x.svg', { type: 'image/svg+xml' }))).rejects.toThrow("SVG"))
  it("rejects MIME spoofing", async () => {
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 4, background: '#fff' } }).png().toBuffer()
    await expect(normalizeBrandingImage(new File([new Uint8Array(bytes)], 'x.jpg', { type: 'image/jpeg' }))).rejects.toThrow("format")
  })
  it("re-encodes valid images", async () => {
    const bytes = await sharp({ create: { width: 80, height: 80, channels: 4, background: '#fff' } }).png().toBuffer()
    const result = await normalizeBrandingImage(new File([new Uint8Array(bytes)], 'x.png', { type: 'image/png' }))
    expect((await sharp(result).metadata()).format).toBe("png")
  })
  it("rejects oversized files", async () => await expect(normalizeBrandingImage(new File([new Uint8Array(2097153)], 'x.png', { type: 'image/png' }))).rejects.toThrow("2 MB"))
})
