import sharp from "sharp";

/** Validates visible ink, not identity or legal validity of a signature. */
export async function validSignature(value: string): Promise<boolean> {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match || value.length > 500000) return false;
  try {
    const bytes = Buffer.from(match[1], "base64");
    if (bytes.length < 100 || bytes.length > 350000) return false;
    const image = sharp(bytes, { limitInputPixels: 2000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (metadata.format !== "png" || (metadata.pages ?? 1) !== 1) return false;
    const { data, info } = await image.toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let ink = 0, left = info.width, right = 0, top = info.height, bottom = 0;
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * 4;
        if (data[offset + 3] > 100 && Math.min(data[offset], data[offset + 1], data[offset + 2]) < 180) {
          ink++; left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
        }
      }
    }
    const area = info.width * info.height;
    return ink >= Math.max(24, area * .0005) && ink < area * .4 && right - left >= 20 && bottom - top >= 5;
  } catch { return false; }
}
