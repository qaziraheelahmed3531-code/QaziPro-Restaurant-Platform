import { describe, expect, it } from "vitest";
import { branchChangeNeedsConfirmation, restoreBranch } from "./branch";
import { emptyCart } from "./cart";
const bootstrap = { branches: [{ id: "b1" }, { id: "b2" }] } as never;
describe("branch lifecycle", () => {
  it("restores a valid branch", () =>
    expect(restoreBranch(bootstrap, "b2")?.id).toBe("b2"));
  it("clears a stale branch", () =>
    expect(restoreBranch(bootstrap, "stale")).toBeNull());
  it("auto-selects only branch", () =>
    expect(restoreBranch({ branches: [{ id: "b1" }] } as never, null)?.id).toBe(
      "b1",
    ));
  it("does not auto-select multiple branches", () =>
    expect(restoreBranch(bootstrap, null)).toBeNull());
  it("confirms populated cross-branch switch", () =>
    expect(
      branchChangeNeedsConfirmation(
        { id: "b1" } as never,
        { id: "b2" } as never,
        { ...emptyCart("r", "b1"), lines: [{} as never] },
      ),
    ).toBe(true));
  it("allows empty cross-branch switch", () =>
    expect(
      branchChangeNeedsConfirmation(
        { id: "b1" } as never,
        { id: "b2" } as never,
        emptyCart("r", "b1"),
      ),
    ).toBe(false));
});
