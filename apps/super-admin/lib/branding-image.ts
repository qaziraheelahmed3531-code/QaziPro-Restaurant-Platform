import sharp from "sharp"

export async function normalizeBrandingImage(file: File): Promise<Buffer> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error("Use a PNG, JPEG or WebP image. SVG files are not accepted.")
  if (!file.size || file.size > 2 * 1024 * 1024) throw new Error("Choose an image smaller than 2 MB.")
  const bytes = Buffer.from(await file.arrayBuffer())
  const image = sharp(bytes, { limitInputPixels: 16_000_000, animated: false })
  const metadata = await image.metadata()
  const formats: Record<string, string> = { png: "image/png", jpeg: "image/jpeg", webp: "image/webp" }
  if (formats[metadata.format ?? ""] !== file.type || !metadata.width || !metadata.height || metadata.width < 32 || metadata.height < 32 || metadata.width > 4000 || metadata.height > 4000 || (metadata.pages ?? 1) > 1) throw new Error("Use a static image from 32 to 4000 pixels per side with a matching file format.")
  // Decode and re-encode strips metadata and never stores untrusted SVG/HTML.
  return image.rotate().resize(1024, 1024, { fit: "inside", withoutEnlargement: true }).png().toBuffer()
}
