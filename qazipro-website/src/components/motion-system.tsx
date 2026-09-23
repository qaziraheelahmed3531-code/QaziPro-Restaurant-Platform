"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const revealSelector = [
  ".section-heading", ".platform-heading", ".offer-card", ".development-card",
  ".content-card", ".ecosystem-item", ".process-grid > div", ".feature-art",
  ".feature-copy", ".project-card", ".home-work-card", ".feature-list > *",
  ".capability-list > *", ".service-directory > *", ".faq-list > *",
  ".lead-form", ".founder-portrait", ".stack-item", ".footer-grid > *",
  ".footer-cta > *", ".contact-methods > *", "[data-reveal]",
].join(",");

const cardSelector = ".offer-card,.development-card,.content-card,.ecosystem-item,.project-card,.home-work-card,.feature-list article,.capability-list li,.service-directory a,.process-grid>div,.stack-item,.faq-list details,.feature-node";

export function MotionSystem() {
  const pathname = usePathname();
  const cursor = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const lenis = new Lenis({ duration: 1.32, smoothWheel: true, wheelMultiplier: 0.86, touchMultiplier: 1.08 });
    let frame = 0;
    const animate = (time: number) => {
      lenis.raf(time);
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let dispose = () => {};

    // The motion shell can hydrate before a streamed route. Decorating the DOM
    // only after this guard prevents React hydration mismatches.
    let hydrationSafeTimer = 0;
    const initialize = () => {
      hydrationSafeTimer = window.setTimeout(() => {
      if (cancelled) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const finePointer = window.matchMedia("(pointer: fine)").matches;
      const nativeScrollReveal = CSS.supports("animation-timeline: view()");
      const nativeScrollProgress = CSS.supports("animation-timeline: scroll()");
      const revealTargets = Array.from(document.querySelectorAll<HTMLElement>(revealSelector));
      const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          requestAnimationFrame(() => (entry.target as HTMLElement).classList.add("reveal-visible"));
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.13, rootMargin: "0px 0px -7%" });

      // Modern Chromium uses the CSS scroll timeline below. Avoid decorating
      // streamed React nodes before their hydration has completed. The
      // IntersectionObserver remains a progressive fallback for older engines.
      if (!nativeScrollReveal && !reduceMotion) {
        revealTargets.forEach((element, index) => {
          element.classList.add("reveal-ready");
          element.style.setProperty("--reveal-delay", `${Math.min(index % 4, 3) * 75}ms`);
          observer.observe(element);
        });
      }

      const parallaxTargets = Array.from(document.querySelectorAll<HTMLElement>(".product-visual,.shopify-hero-visual,.founder-portrait-primary,.feature-art"));
      let scrollFrame = 0;
      const updateScroll = () => {
        if (scrollFrame) return;
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = 0;
          if (!nativeScrollProgress) {
            const max = document.documentElement.scrollHeight - window.innerHeight;
            document.documentElement.style.setProperty("--scroll-progress", String(max > 0 ? window.scrollY / max : 0));
          }
          document.body.toggleAttribute("data-scrolled", window.scrollY > 24);
          if (!reduceMotion) {
            parallaxTargets.forEach((element) => {
              const bounds = element.getBoundingClientRect();
              const distance = bounds.top + bounds.height / 2 - window.innerHeight / 2;
              element.style.setProperty("--motion-y", `${Math.max(-26, Math.min(26, distance * -0.035)).toFixed(2)}px`);
            });
          }
        });
      };
      window.addEventListener("scroll", updateScroll, { passive: true });

      const buttons = Array.from(document.querySelectorAll<HTMLElement>(".button,.client-portal-button,.project-filters button,.mobile-menu-toggle"));
      const buttonCleanups = buttons.map((element) => {
        const positionFill = (event: PointerEvent) => {
          const bounds = element.getBoundingClientRect();
          element.style.setProperty("--fill-x", `${event.clientX - bounds.left}px`);
          element.style.setProperty("--fill-y", `${event.clientY - bounds.top}px`);
          element.style.setProperty("--magnet-x", `${(event.clientX - bounds.left - bounds.width / 2) * 0.065}px`);
          element.style.setProperty("--magnet-y", `${(event.clientY - bounds.top - bounds.height / 2) * 0.065}px`);
        };
        const leave = (event: PointerEvent) => {
          positionFill(event);
          element.style.setProperty("--magnet-x", "0px");
          element.style.setProperty("--magnet-y", "0px");
        };
        element.addEventListener("pointerenter", positionFill);
        element.addEventListener("pointermove", positionFill);
        element.addEventListener("pointerleave", leave);
        return () => {
          element.removeEventListener("pointerenter", positionFill);
          element.removeEventListener("pointermove", positionFill);
          element.removeEventListener("pointerleave", leave);
        };
      });

      const cards = Array.from(document.querySelectorAll<HTMLElement>(cardSelector));
      const cardCleanups = cards.map((element) => {
        const move = (event: PointerEvent) => {
          const bounds = element.getBoundingClientRect();
          element.style.setProperty("--spot-x", `${event.clientX - bounds.left}px`);
          element.style.setProperty("--spot-y", `${event.clientY - bounds.top}px`);
        };
        element.addEventListener("pointermove", move);
        return () => element.removeEventListener("pointermove", move);
      });

      let cursorFrame = 0;
      let targetX = -100;
      let targetY = -100;
      let ringX = -100;
      let ringY = -100;
      const renderCursor = () => {
        ringX += (targetX - ringX) * 0.19;
        ringY += (targetY - ringY) * 0.19;
        if (cursor.current) cursor.current.style.transform = `translate3d(${ringX}px,${ringY}px,0)`;
        if (dot.current) dot.current.style.transform = `translate3d(${targetX}px,${targetY}px,0)`;
        cursorFrame = requestAnimationFrame(renderCursor);
      };
      const onPointerMove = (event: PointerEvent) => {
        targetX = event.clientX;
        targetY = event.clientY;
        document.body.setAttribute("data-cursor-ready", "");
      };
      const onPointerOver = (event: PointerEvent) => {
        const interactive = (event.target as HTMLElement).closest("a,button,input,select,textarea,summary,[data-cursor]");
        document.body.toggleAttribute("data-cursor-active", Boolean(interactive));
        const label = interactive?.getAttribute("data-cursor") || "";
        if (cursor.current) cursor.current.dataset.label = label;
      };
      const onPointerOut = (event: PointerEvent) => {
        if (!(event.relatedTarget as HTMLElement | null)?.closest?.("a,button,input,select,textarea,summary,[data-cursor]")) {
          document.body.removeAttribute("data-cursor-active");
          if (cursor.current) cursor.current.dataset.label = "";
        }
      };

      if (!reduceMotion && finePointer) {
        cursorFrame = requestAnimationFrame(renderCursor);
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        document.addEventListener("pointerover", onPointerOver);
        document.addEventListener("pointerout", onPointerOut);
      }

      dispose = () => {
        cancelAnimationFrame(cursorFrame);
        cancelAnimationFrame(scrollFrame);
        observer.disconnect();
        buttonCleanups.forEach((cleanup) => cleanup());
        cardCleanups.forEach((cleanup) => cleanup());
        window.removeEventListener("scroll", updateScroll);
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerover", onPointerOver);
        document.removeEventListener("pointerout", onPointerOut);
      };
      }, 140);
    };

    if (document.readyState === "complete") initialize();
    else window.addEventListener("load", initialize, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", initialize);
      window.clearTimeout(hydrationSafeTimer);
      dispose();
    };
  }, [pathname]);

  return <><div ref={cursor} className="cursor-ring" aria-hidden="true"/><div ref={dot} className="cursor-dot" aria-hidden="true"/><div className="scroll-progress" aria-hidden="true"/></>;
}
