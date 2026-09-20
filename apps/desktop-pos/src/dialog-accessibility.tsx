import { useEffect } from "react";

/** Keep keyboard focus inside the current checkout, receipt or options dialog. */
export function DesktopDialogs() {
  useEffect(() => {
    let active: HTMLElement | null = null;
    let previous: HTMLElement | null = null;
    let frame = 0;
    const controls = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],[tabindex="0"]')].filter(element => element.getClientRects().length > 0);
    const sync = () => {
      const next = [...document.querySelectorAll<HTMLElement>(".modal > section")].at(-1) ?? null;
      if (next === active) return;
      cancelAnimationFrame(frame);
      if (!active && next) previous = document.activeElement as HTMLElement | null;
      active = next;
      document.querySelectorAll<HTMLElement>(".premium-pos > aside,.premium-pos > .workspace").forEach(element => { element.inert = Boolean(active && !element.contains(active)); });
      if (!next) { if (previous?.isConnected) previous.focus({preventScroll:true}); return; }
      next.setAttribute("role", "dialog");
      next.setAttribute("aria-modal", "true");
      next.setAttribute("aria-label", next.querySelector("h2")?.textContent ?? "Order details");
      frame = requestAnimationFrame(() => controls(next)[0]?.focus({preventScroll:true}));
    };
    const keydown = (event: KeyboardEvent) => {
      if (!active) return;
      if (event.key === "Escape") {
        const close = active.querySelector<HTMLButtonElement>("header button");
        if (close && !close.disabled) { event.preventDefault(); close.click(); }
      }
      if (event.key !== "Tab") return;
      const elements = controls(active), first = elements[0], last = elements.at(-1);
      if (!first || !last) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    };
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {childList:true,subtree:true});
    document.addEventListener("keydown", keydown); sync();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); document.removeEventListener("keydown", keydown); document.querySelectorAll<HTMLElement>(".premium-pos > aside,.premium-pos > .workspace").forEach(element=>{element.inert=false}); };
  }, []);
  return null;
}
