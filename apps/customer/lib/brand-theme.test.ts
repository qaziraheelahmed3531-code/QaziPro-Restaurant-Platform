import { describe, expect, it } from "vitest"
import { accessibleText, brandInteractionColor, contrastRatio, readableTextOn, safeHex } from "./brand-theme"

describe("restaurant theme contrast", () => {
  it("does not accept CSS injection as a colour", () => {
    expect(safeHex("red; background:url(https://example.test)")).toBe("#A92114")
  })
  it("chooses readable foregrounds across the colour spectrum and interaction states", () => {
    for (let r = 0; r <= 255; r += 17) for (let g = 0; g <= 255; g += 17) for (let b = 0; b <= 255; b += 17) {
      const background = "#" + [r, g, b].map(channel => channel.toString(16).padStart(2, "0")).join("")
      const foreground = readableTextOn(background)
      expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5)
      for (const amount of [.1, .18]) expect(contrastRatio(foreground, brandInteractionColor(background, amount))).toBeGreaterThanOrEqual(4.5)
    }
  })
  it("corrects light configured text without changing accessible brand text", () => {
    expect(accessibleText("#eeeeee", "#ffffff")).toBe("#000000")
    expect(accessibleText("#A92114", "#FFF9F2")).toBe("#A92114")
  })
  it("never retains a different tenant's palette", () => {
    expect(readableTextOn("#ffffff")).toBe("#000000")
    expect(readableTextOn("#000000")).toBe("#ffffff")
    expect(readableTextOn("#ffffff")).toBe("#000000")
  })
})
