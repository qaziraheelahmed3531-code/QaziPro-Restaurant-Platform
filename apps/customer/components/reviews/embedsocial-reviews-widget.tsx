/* eslint-disable @next/next/no-img-element -- EmbedSocial requires its official branding markup. */
"use client"

import Script from "next/script"
import { useCallback, useEffect, useRef, useState } from "react"

const scriptId = "EmbedSocialHashtagScript"
const scriptSource = "https://embedsocial.com/cdn/ht.js"

type WidgetStatus = "loading" | "ready" | "error"

export function EmbedSocialReviewsWidget({ widgetReference, onStatusChange }: { widgetReference: string; onStatusChange: (status: WidgetStatus) => void }) {
  const boundaryRef = useRef<HTMLDivElement>(null)
  const widgetRef = useRef<HTMLDivElement>(null)
  const [nearViewport, setNearViewport] = useState(false)
  const [status, setStatus] = useState<WidgetStatus>("loading")

  const updateStatus = useCallback((nextStatus: WidgetStatus) => {
    setStatus(nextStatus)
    onStatusChange(nextStatus)
  }, [onStatusChange])

  const detectWidget = useCallback(() => {
    const container = widgetRef.current
    if (!container) return false
    const hasEmbedContent = Boolean(container.querySelector("iframe"))
      || Array.from(container.children).some((child) => !child.classList.contains("feed-powered-by-es"))
    if (hasEmbedContent) updateStatus("ready")
    return hasEmbedContent
  }, [updateStatus])

  useEffect(() => {
    const boundary = boundaryRef.current
    if (!boundary || typeof IntersectionObserver === "undefined") {
      setNearViewport(true)
      return
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setNearViewport(true)
        observer.disconnect()
      }
    }, { rootMargin: "500px 0px" })
    observer.observe(boundary)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const container = widgetRef.current
    if (!container) return
    if (detectWidget()) return
    const observer = new MutationObserver(() => { detectWidget() })
    observer.observe(container, { childList: true, subtree: true })
    return () => observer.disconnect()
  }, [detectWidget])

  useEffect(() => {
    if (!nearViewport || status !== "loading") return
    const timeout = window.setTimeout(() => {
      if (!detectWidget()) updateStatus("error")
    }, 20_000)
    return () => window.clearTimeout(timeout)
  }, [detectWidget, nearViewport, status, updateStatus])

  return (
    <div ref={boundaryRef} className="embedsocial-widget-shell" data-widget-status={status} aria-busy={status === "loading"}>
      {status === "loading" && (
        <div className="embedsocial-widget-skeleton" role="status">
          <span>Loading Google reviews…</span>
        </div>
      )}
      <div
        ref={widgetRef}
        className="embedsocial-hashtag"
        data-ref={widgetReference}
        data-dynamicload="yes"
        data-lazyload="yes"
      >
        <a
          className="feed-powered-by-es feed-powered-by-es-feed-img es-widget-branding"
          href="https://embedsocial.com/google-reviews-widget/"
          target="_blank"
          rel="noopener noreferrer"
          title="Embed Google reviews"
        >
          <img src="https://embedsocial.com/cdn/icon/embedsocial-logo.webp" alt="EmbedSocial" />
          <div className="es-widget-branding-text">Embed Google reviews</div>
        </a>
      </div>
      {nearViewport && (
        <Script
          id={scriptId}
          src={scriptSource}
          strategy="lazyOnload"
          onLoad={() => { detectWidget() }}
          onReady={() => { detectWidget() }}
          onError={() => updateStatus("error")}
        />
      )}
    </div>
  )
}
