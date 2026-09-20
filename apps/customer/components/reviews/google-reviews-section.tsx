"use client"

import { ExternalLink, Star } from "lucide-react"
import { useEffect, useState } from "react"

import { EmbedSocialReviewsWidget } from "@/components/reviews/embedsocial-reviews-widget"
import { useApp } from "@/components/providers/app-provider"
import type { GooglePlacesReviewsApiPayload } from "@/lib/google-places/types"

type WidgetStatus = "loading" | "ready" | "error"

export function GoogleReviewsSection() {
  const { storefront } = useApp()
  const [payload, setPayload] = useState<GooglePlacesReviewsApiPayload | null>(null)
  const [widgetStatus, setWidgetStatus] = useState<WidgetStatus>("loading")

  useEffect(() => {
    const controller = new AbortController()
    void fetch("/api/google-reviews", { signal: controller.signal, headers: { Accept: "application/json" } })
      .then(async (response) => {
        if (!response.ok) throw new Error("Reviews request failed")
        return response.json() as Promise<GooglePlacesReviewsApiPayload>
      })
      .then(setPayload)
      .catch(() => {
        if (!controller.signal.aborted) setPayload({
          ok: false,
          available: false,
          source: "google-places-new",
          stage: "parsing",
          status: 500,
          code: "CLIENT_REQUEST_FAILED",
          message: "Google Places reviews could not be loaded.",
          businessName: storefront.business.reviewsBusinessName ?? storefront.business.displayName,
          reviews: [],
          rating: null,
          totalReviewCount: null,
          googleMapsLinks: { placeUri: null, reviewsUri: null, writeAReviewUri: null },
        })
      })
    return () => controller.abort()
  }, [storefront.business.displayName, storefront.business.reviewsBusinessName])

  if (!storefront.business.reviewsEnabled) return null

  const viewAllUrl = payload?.googleMapsLinks.reviewsUri ?? payload?.googleMapsLinks.placeUri ?? null
  const writeReviewUrl = payload?.googleMapsLinks.writeAReviewUri ?? null

  return (
    <section className="google-reviews-section" id="google-reviews" aria-labelledby="google-reviews-title">
      <div className="google-reviews-inner">
        <header className="google-reviews-heading">
          <div>
            <h2 id="google-reviews-title">{storefront.business.reviewsTitle}</h2>
            <small className="reviewed-business">Reviews for {payload?.businessName ?? storefront.business.reviewsBusinessName ?? storefront.business.displayName}</small>
          </div>
          {payload?.available && payload.rating !== null && payload.totalReviewCount !== null && (
            <p><Star className="is-filled" aria-hidden="true" /><strong>{payload.rating.toFixed(1)}</strong><span>Based on {payload.totalReviewCount.toLocaleString("en-PK")} Google reviews</span></p>
          )}
        </header>

        {storefront.business.reviewsWidgetId ? <EmbedSocialReviewsWidget key={storefront.business.reviewsWidgetId} widgetReference={storefront.business.reviewsWidgetId} onStatusChange={setWidgetStatus} /> : <p className="google-reviews-widget-fallback">Review widget is not configured yet.</p>}

        {widgetStatus === "error" && (
          <p className="google-reviews-widget-fallback" role="status">Google review comments are temporarily unavailable.</p>
        )}

        {payload && ((widgetStatus === "error" && writeReviewUrl) || viewAllUrl) && (
          <div className="google-reviews-actions">
            {widgetStatus === "error" && writeReviewUrl && <a className="review-action" href={writeReviewUrl} target="_blank" rel="noopener noreferrer">Write a Review <ExternalLink aria-hidden="true" /></a>}
            {viewAllUrl && <a className="review-action review-action--quiet" href={viewAllUrl} target="_blank" rel="noopener noreferrer">View all on Google <ExternalLink aria-hidden="true" /></a>}
          </div>
        )}
      </div>
    </section>
  )
}
