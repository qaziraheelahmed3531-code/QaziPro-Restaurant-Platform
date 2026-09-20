import type { Bootstrap, Branch, Cart } from "@/contracts/types";
export const restoreBranch = (
  bootstrap: Bootstrap,
  savedId: string | null,
): Branch | null =>
  bootstrap.branches.find((branch) => branch.id === savedId) ??
  (bootstrap.branches.length === 1 ? bootstrap.branches[0] : null);
export const branchChangeNeedsConfirmation = (
  current: Branch | null,
  next: Branch,
  cart: Cart,
) => Boolean(current && current.id !== next.id && cart.lines.length);
