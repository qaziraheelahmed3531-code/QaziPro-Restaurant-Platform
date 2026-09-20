export function mediaUrlError(value: string): string | null {
  if (!value.trim()) return null
  if (value !== value.trim() || /[\\\s\u0000-\u001f]/.test(value)) return "Remove spaces or backslashes from the image link."
  if (value.startsWith("/")) {
    try {
      let path = value.split(/[?#]/)[0]
      for (let i = 0; i < 3; i++) { const decoded = decodeURIComponent(path); if (decoded === path) break; path = decoded }
      if (!path.startsWith("//") && !path.includes("\\") && !/[\u0000-\u001f]/.test(path) && !path.split("/").includes("..")) return null
    } catch { /* Malformed escaped paths are not safe public image paths. */ }
    return "Use a safe public image path without parent-directory segments."
  }
  try {
    const url = new URL(value)
    if (url.protocol === "https:" && !url.username && !url.password) return null
  } catch { /* Show the same useful validation message. */ }
  return "Use an HTTPS image link or a safe public path starting with /."
}

export function mediaFileError(file: Pick<File, "name" | "type" | "size">): string | null {
  const types: Record<string, string[]> = { "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"] }
  const extension = file.name.toLowerCase().split(".").pop() ?? ""
  if (!types[file.type]?.includes(extension)) return "Choose a JPG, PNG or WebP file with a matching file extension."
  if (file.size === 0 || file.size > 10 * 1024 * 1024) return "Choose a non-empty image smaller than 10 MB."
  return null
}

export function mediaPreviewUrl(value: string, assetOrigin?: string) {
  if (value.startsWith("/") && !value.startsWith("//") && assetOrigin) {
    try { return new URL(value, assetOrigin).href } catch { return value }
  }
  return value
}

export async function mediaSignatureError(file: File): Promise<string | null> {
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const matches = file.type === "image/png" ? [137,80,78,71,13,10,26,10].every((v,i) => header[i] === v)
    : file.type === "image/jpeg" ? header[0] === 255 && header[1] === 216 && header[2] === 255
    : file.type === "image/webp" ? String.fromCharCode(...header.slice(0,4)) === "RIFF" && String.fromCharCode(...header.slice(8,12)) === "WEBP" : false
  return matches ? null : "The file contents do not match this image format. Choose a genuine JPG, PNG or WebP image."
}
