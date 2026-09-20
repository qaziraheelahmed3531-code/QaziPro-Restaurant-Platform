"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import Image from "next/image"
import { AnimatePresence, motion, type PanInfo } from "motion/react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import type { HeroSettings, HeroSlide } from "@/types"

const fallbackSlides = (businessName: string): HeroSlide[] => [{ id: "fallback", image: "/images/hero/hero-01.svg", alt: `${businessName} promotion` }]
const HERO_SLIDE_EASE = [0.4, 0, 0.2, 1] as const

export function HeroCarousel({ slides, settings, businessName }: { slides: HeroSlide[]; settings: HeroSettings; businessName: string }) {
  const sourceSlides = slides.length ? slides : fallbackSlides(businessName)
  const [failed, setFailed] = useState<Set<string>>(() => new Set())
  const heroSlides = useMemo(() => sourceSlides.filter(slide => !failed.has(slide.id)), [failed, sourceSlides])
  const slideCount = heroSlides.length
  const [[rawIndex, direction], setSlide] = useState([0, 1])
  const [pageHidden, setPageHidden] = useState(false)
  const [dragging, setDragging] = useState(false)
  const transitioning = useRef(false)
  const [imageAspectRatio, setImageAspectRatio] = useState<number | null>(null)
  const index = slideCount ? rawIndex % slideCount : 0

  const advance = useCallback((nextDirection = 1) => {
    if (slideCount < 2 || transitioning.current) return
    transitioning.current = true
    setSlide(([current]) => [(current + nextDirection + slideCount) % slideCount, nextDirection])
  }, [slideCount])

  useEffect(() => {
    if (slideCount < 2 || !settings.autoplay || pageHidden || dragging) return
    const timer = window.setInterval(() => advance(1), Math.max(settings.intervalMs, settings.transitionMs + 300))
    return () => window.clearInterval(timer)
  }, [advance, dragging, pageHidden, settings.autoplay, settings.intervalMs, settings.transitionMs, slideCount])

  useEffect(() => {
    const visibility = () => setPageHidden(document.hidden)
    visibility()
    document.addEventListener("visibilitychange", visibility)
    return () => document.removeEventListener("visibilitychange", visibility)
  }, [])

  useEffect(() => {
    if (slideCount < 2) return
    const next = heroSlides[(index + 1) % slideCount]
    for (const src of [next.mobileImage, next.image].filter(Boolean) as string[]) {
      const preload = new window.Image()
      preload.src = src
    }
  }, [heroSlides, index, slideCount])

  if (!slideCount) return null

  const slide = heroSlides[index]
  const duration = settings.transitionMs / 1000
  const go = (nextDirection: number) => advance(nextDirection)

  return (
      <section className="hero-carousel" style={imageAspectRatio ? { aspectRatio: imageAspectRatio } : undefined} tabIndex={0} onKeyDown={event => { if (event.key === "ArrowLeft") { event.preventDefault(); go(-1) } if (event.key === "ArrowRight") { event.preventDefault(); go(1) } }} data-active-index={index} data-autoplay={settings.autoplay} data-interval-ms={settings.intervalMs} data-transition-ms={duration * 1000} data-image-aspect-ratio={imageAspectRatio ?? undefined} aria-roledescription="carousel" aria-label={`${businessName} promotions`}>
        <AnimatePresence initial={false} custom={direction} mode="sync">
          <motion.div
            key={slide.id}
            className="hero-slide"
            custom={direction}
            initial={{ x:direction > 0 ? "100%" : "-100%" }}
            animate={{ x:"0%" }}
            exit={{ x:direction > 0 ? "-100%" : "100%" }}
            transition={{ type:"tween", duration, ease:HERO_SLIDE_EASE }}
            onAnimationComplete={() => { transitioning.current = false }}
            drag={slideCount < 2 ? false : "x"}
            dragConstraints={{ left:0, right:0 }}
            dragElastic={0.1}
            dragMomentum={false}
            onDragStart={() => setDragging(true)}
            onDragEnd={(_:MouseEvent | TouchEvent | PointerEvent, info:PanInfo) => {
              setDragging(false)
              const swipe = Math.abs(info.offset.x) > 55 ? info.offset.x : Math.abs(info.velocity.x) > 450 ? info.velocity.x : 0
              if (swipe) advance(swipe < 0 ? 1 : -1)
            }}
          >
            <picture>{slide.mobileImage && <source media="(max-width: 767px)" srcSet={slide.mobileImage} />}<Image src={slide.image} alt={slide.alt} fill unoptimized draggable={false} priority={index === 0} loading="eager" sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1360px) calc(100vw - 48px), 1312px" onLoad={(event) => { const { naturalWidth, naturalHeight } = event.currentTarget; if (naturalWidth > 0 && naturalHeight > 0) setImageAspectRatio(naturalWidth / naturalHeight) }} onError={() => { transitioning.current = false; setFailed(current => new Set(current).add(slide.id)) }} /></picture>
          </motion.div>
        </AnimatePresence>
        {slideCount > 1 && <><button className="hero-arrow hero-arrow--previous" type="button" aria-label="Previous promotion" onClick={() => go(-1)}><ChevronLeft aria-hidden="true" /></button><button className="hero-arrow hero-arrow--next" type="button" aria-label="Next promotion" onClick={() => go(1)}><ChevronRight aria-hidden="true" /></button><div className="hero-dots" aria-label="Choose promotion">{heroSlides.map((item, itemIndex) => <button key={item.id} type="button" className={itemIndex === index ? "is-active" : ""} aria-label={`Show promotion ${itemIndex + 1}`} aria-current={itemIndex === index ? "true" : undefined} onClick={() => { if (itemIndex === index || transitioning.current) return; transitioning.current = true; setSlide([itemIndex, itemIndex > index ? 1 : -1]) }} />)}</div></>}
        <span className="sr-only" aria-live={dragging ? "polite" : "off"}>Promotion {index + 1} of {slideCount}</span>
      </section>
  )
}
