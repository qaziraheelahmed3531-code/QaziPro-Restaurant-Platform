/** Pure colour helpers: no browser state and no cross-restaurant cache. */
export function safeHex(value: string, fallback = "#A92114"): string {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : fallback
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map(offset => {
    const channel = parseInt(safeHex(hex).slice(offset, offset + 2), 16) / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722
}

export function contrastRatio(a: string, b: string) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (values[0] + .05) / (values[1] + .05)
}

export function readableTextOn(background: string) {
  return contrastRatio(background, "#000000") >= contrastRatio(background, "#ffffff") ? "#000000" : "#ffffff"
}

export function accessibleText(preferred: string, background: string) {
  const candidate = safeHex(preferred, "#1F1A18")
  return contrastRatio(candidate, background) >= 4.5 ? candidate : readableTextOn(background)
}

/** Keep the chosen foreground readable in hover/pressed states too. */
export function brandInteractionColor(background: string, amount: number) {
  const color = safeHex(background)
  const target = readableTextOn(color) === "#ffffff" ? 0 : 255
  return "#" + [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * (1 - amount) + target * amount).toString(16).padStart(2, "0")).join("")
}
