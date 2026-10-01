"use client";

import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

export function MotionSystem() {
  const pathname = usePathname();
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let dispose = () => {};
    let generation = 0;
    const setup = () => {
      dispose();
      const current = ++generation;
      if (preference.matches) return;
      // Native touch scrolling stays native. One GSAP ticker owns Lenis;
      // no custom cursor loop, per-card listeners or scroll layout reads.
      void Promise.all([import("gsap"), import("gsap/ScrollTrigger")]).then(([module, plugin]) => {
        if (current !== generation) return;
        const gsap = module.default;
        const ScrollTrigger = plugin.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);
        const lenis = matchMedia("(pointer: fine)").matches ? new Lenis({ duration: .85, smoothWheel: true, anchors: true, autoRaf: false, prevent: node => Boolean(node.closest(".mobile-nav,[data-lenis-prevent]")) }) : null;
        const tick = (seconds: number) => lenis?.raf(seconds * 1000);
        lenis?.on("scroll", ScrollTrigger.update);
        if (lenis) gsap.ticker.add(tick);
        const context = gsap.context(() => {
          const story = document.querySelector(".platform-section");
          if (story) gsap.fromTo(story, { "--story-light": 0 }, { "--story-light": 1, ease: "none", scrollTrigger: { trigger: story, start: "top bottom", end: "bottom top", scrub: .35 } });
        });
        const refresh = () => { if (current === generation) ScrollTrigger.refresh(); };
        void document.fonts.ready.then(refresh);
        const resize = new ResizeObserver(refresh);
        const main = document.querySelector("main");
        if (main) resize.observe(main);
        dispose = () => { resize.disconnect(); context.revert(); if (lenis) { gsap.ticker.remove(tick); lenis.off("scroll", ScrollTrigger.update); lenis.destroy(); } };
      });
    };
    setup();
    preference.addEventListener("change", setup);
    return () => { generation++; dispose(); preference.removeEventListener("change", setup); };
  }, [pathname]);
  return <div className="scroll-progress" aria-hidden="true"/>;
}
