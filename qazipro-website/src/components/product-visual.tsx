"use client";

import Image from "next/image";
import { ArrowLeft, ArrowRight, Pause, Play } from "lucide-react";
import { motion } from "motion/react";
import { useReducedMotion } from "@/lib/use-reduced-motion";
import { useEffect, useRef, useState } from "react";

const slides = [
  { title: "Restaurant Admin", description: "Orders, branches and reports in one operational workspace.", image: "/product/restaurant-admin-dashboard.png" },
  { title: "Online ordering", description: "The same menu, ready for your customers.", image: "/product/restaurant-ordering.png" },
];

export function ProductVisual({ compact = false }: { compact?: boolean }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotion();
  const touchX = useRef<number | null>(null);
  const move = (amount: number) => { setPaused(true); setIndex(current => (current + amount + slides.length) % slides.length); };
  useEffect(() => {
    const change = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);
  useEffect(() => {
    if (paused || interacting || !visible || reduced || compact) return;
    const timer = setInterval(() => setIndex(current => (current + 1) % slides.length), 5000);
    return () => clearInterval(timer);
  }, [paused, interacting, visible, reduced, compact]);

  return <section className={`product-showcase ${compact ? "product-showcase-compact" : ""}`} aria-label="QaziPro product screens" aria-roledescription="carousel"
    onPointerEnter={() => setInteracting(true)} onPointerLeave={() => setInteracting(false)}
    onFocusCapture={() => setInteracting(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false); }}
    onKeyDown={event => { if (event.key === "ArrowRight" || event.key === "ArrowLeft") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); } }}
    onTouchStart={event => { touchX.current = event.touches[0].clientX; }}
    onTouchEnd={event => { if (touchX.current !== null && Math.abs(event.changedTouches[0].clientX - touchX.current) > 45) move(event.changedTouches[0].clientX < touchX.current ? 1 : -1); touchX.current = null; }}>
    <div className="product-screen-chrome"><span aria-hidden="true">● ● ●</span><strong>QaziPro / {slides[index].title}</strong><span>PRODUCT PREVIEW</span></div>
    <div className="product-screen-viewport">
      {slides.map((slide, position) => <motion.div className="product-screen-slide" key={slide.image} aria-hidden={position !== index}
        initial={false} animate={{ opacity: position === index ? 1 : 0, x: position === index || reduced ? 0 : 10 }}
        transition={{ duration: reduced ? 0 : .28, ease: [.22, .8, .28, 1] }}>
        <Image src={slide.image} alt={slide.title + " — actual QaziPro application with staging demonstration data"} fill sizes="(max-width: 900px) 92vw, 640px" fetchPriority={position === 0 ? "high" : "low"} loading={position === 0 ? "eager" : "lazy"} />
      </motion.div>)}
    </div>
    <div className="product-screen-caption"><div aria-live={paused ? "polite" : "off"}><strong>{slides[index].title}</strong><p>{slides[index].description}</p><small>Actual application · demonstration data</small></div><div className="product-screen-controls">
      <button type="button" aria-label="Previous product screen" onClick={() => move(-1)}><ArrowLeft size={17}/></button>
      {!compact && <button type="button" aria-label={paused || reduced ? "Start product slideshow" : "Pause product slideshow"} disabled={Boolean(reduced)} onClick={() => setPaused(!paused)}>{paused || reduced ? <Play size={15}/> : <Pause size={15}/>}</button>}
      <button type="button" aria-label="Next product screen" onClick={() => move(1)}><ArrowRight size={17}/></button>
    </div></div>
    <div className="product-screen-dots" role="group" aria-label="Choose product screen">{slides.map((slide, position) => <button type="button" key={slide.title} aria-label={slide.title} aria-pressed={position === index} onClick={() => { setPaused(true); setIndex(position); }}/>)}</div>
  </section>;
}
