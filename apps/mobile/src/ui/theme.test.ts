import { describe, expect, it } from "vitest";
import { colors, themeColors } from "./theme";

describe("runtime Admin branding", () => {
  it("uses verified bootstrap colors", () => {
    expect(
      themeColors({
        primary: "#123456",
        secondary: "#abcdef",
        background: "#f0f0f0",
        text: "#101010",
      }),
    ).toMatchObject({
      primary: "#123456",
      gold: "#abcdef",
      background: "#f0f0f0",
      ink: "#101010",
    });
  });
  it("rejects malformed remote colors", () =>
    expect(
      themeColors({
        primary: "red",
        secondary: "bad",
        background: "transparent",
        text: "#000",
      }),
    ).toEqual(colors));
});
