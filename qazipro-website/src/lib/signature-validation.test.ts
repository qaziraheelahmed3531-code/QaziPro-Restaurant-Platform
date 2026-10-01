import { describe, expect, it } from "vitest";
import sharp from "sharp";
import { validSignature } from "./signature-validation";

const uri = (data: Buffer) => `data:image/png;base64,${data.toString("base64")}`;
describe("signature ink validation", () => {
  it.each(["white", "black", {r:0,g:0,b:0,alpha:0}])("rejects blank/solid canvas %s", async background => {
    const png = await sharp({create:{width:600,height:160,channels:4,background}}).png().toBuffer();
    expect(await validSignature(uri(png))).toBe(false);
  });
  it("accepts actual visible strokes", async () => {
    const png = await sharp(Buffer.from('<svg width="600" height="160"><path d="M30 100 Q160 20 280 80 T550 40" fill="none" stroke="#21142b" stroke-width="5"/></svg>')).png().toBuffer();
    expect(await validSignature(uri(png))).toBe(true);
  });
  it("rejects corrupt and oversized pixel input", async () => {
    expect(await validSignature(uri(Buffer.from("not a PNG")))).toBe(false);
    const png = await sharp({create:{width:2000,height:1100,channels:4,background:"white"}}).png().toBuffer();
    expect(await validSignature(uri(png))).toBe(false);
  });
});
