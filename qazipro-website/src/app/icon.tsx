import { readFile } from "node:fs/promises";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default async function Icon() {
  const logo = await readFile(new URL("../../public/brand/qazipro-mark-clean.png", import.meta.url));
  const source = `data:image/png;base64,${logo.toString("base64")}`;

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: 8, borderRadius: 14, background: "#ffffff" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={source} width={48} height={28} alt="" />
    </div>,
    size,
  );
}
