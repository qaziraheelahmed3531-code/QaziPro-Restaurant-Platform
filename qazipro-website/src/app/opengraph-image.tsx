import { ImageResponse } from "next/og";

export const alt = "QaziPro — connected restaurant technology and custom software";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "68px 76px",
        background: "#f7f7f2",
        color: "#10251d",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <div style={{ width: 58, height: 58, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 18, background: "#136c4a", color: "white", fontSize: 30, fontWeight: 800 }}>Q</div>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: -1 }}>QaziPro</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 930 }}>
        <div style={{ display: "flex", color: "#a56e21", fontSize: 22, fontWeight: 700, letterSpacing: 2.2 }}>RESTAURANT TECHNOLOGY · COMMERCE · CUSTOM SOFTWARE</div>
        <div style={{ display: "flex", fontSize: 72, lineHeight: 1.04, letterSpacing: -3.8, fontWeight: 800 }}>One connected system. More room to grow.</div>
        <div style={{ display: "flex", maxWidth: 790, color: "#53645d", fontSize: 27, lineHeight: 1.35 }}>Premium digital systems built around real business operations.</div>
      </div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 22, borderTop: "2px solid #dfe5df", color: "#53645d", fontSize: 20 }}>
        <span>qazipro.com</span>
        <span>Build · Sell · Manage · Grow</span>
      </div>
    </div>,
    size,
  );
}
