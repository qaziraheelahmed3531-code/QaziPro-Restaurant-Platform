"use client"

import { useEffect, useRef, useState } from "react"
import type { Circle, Map as LeafletMap, Marker } from "leaflet"
import { validPoint, type Point } from "./location"
import { AppLoader } from "./app-loader"
import "leaflet/dist/leaflet.css"
import "./location-picker-map.css"

export type LocationPickerMapProps = {
  point?: Point
  center?: Point
  onChange: (point: Point) => void
  radiusMeters?: number
  label?: string
  zoom?: number
  height?: number
  draggable?: boolean
  clickable?: boolean
  disabled?: boolean
  tileKey: string
  audience?: "admin" | "customer"
  markerKind?: "location" | "rider"
  markerImageUrl?: string
  originPoint?: Point
  originImageUrl?: string
  originLabel?: string
}

function safeImageUrl(value?: string) {
  try {
    const url = new URL(value ?? "", window.location.origin)
    return ["http:", "https:"].includes(url.protocol)
      ? url.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
      : ""
  } catch { return "" }
}

export function LocationPickerMap({ point, center, onChange, radiusMeters, label = "Delivery address", zoom = 16, height = 300, draggable = true, clickable = true, disabled = false, tileKey, audience = "customer", markerKind = "location", markerImageUrl, originPoint, originImageUrl, originLabel = "Restaurant" }: LocationPickerMapProps) {
  const element = useRef<HTMLDivElement>(null)
  const map = useRef<LeafletMap | null>(null)
  const marker = useRef<Marker | null>(null)
  const originMarker = useRef<Marker | null>(null)
  const circle = useRef<Circle | null>(null)
  const latest = useRef({ point, center, onChange, draggable, clickable, disabled })
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading")
  const [panEnabled, setPanEnabled] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { latest.current = { point, center, onChange, draggable, clickable, disabled } }, [point, center, onChange, draggable, clickable, disabled])

  useEffect(() => {
    const key = tileKey.trim()
    if (process.env.NODE_ENV === "development") console.info("Geoapify browser map key configured:", Boolean(key), "tile URL host:", "maps.geoapify.com")
    if (!key) return
    let disposed = false
    let resize: ResizeObserver | undefined
    let visibility: IntersectionObserver | undefined
    let frame: number | undefined
    let tileFailures = 0
    let diagnosticSent = false
    const diagnosticAbort = new AbortController()
    void import("leaflet").then(L => {
      if (disposed || !element.current) return
      const initial = [latest.current.point, latest.current.center, originPoint].find(value => value && validPoint(value) && (value.latitude !== 0 || value.longitude !== 0))
      const position: [number, number] = initial && validPoint(initial) ? [initial.latitude, initial.longitude] : [30.3753, 69.3451]
      const instance = L.map(element.current, { scrollWheelZoom: false, dragging: !window.matchMedia("(pointer: coarse)").matches, touchZoom: true, doubleClickZoom: false }).setView(position, initial ? zoom : 5)
      map.current = instance
      L.tileLayer(`https://maps.geoapify.com/v1/tile/osm-bright/{z}/{x}/{y}${L.Browser.retina ? "@2x" : ""}.png?apiKey=${encodeURIComponent(key)}`, { maxZoom: 20, attribution: '<a href="https://www.geoapify.com/">Geoapify</a> | <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | <a href="https://openmaptiles.org/">OpenMapTiles</a>' })
        .on("tileerror", event => {
          if (disposed) return
          tileFailures += 1
          if (tileFailures >= 3) setStatus("error")
          if (process.env.NODE_ENV === "development" && !diagnosticSent) {
            diagnosticSent = true
            const url = (event.tile as HTMLImageElement).src
            void fetch(url, { signal: AbortSignal.any([diagnosticAbort.signal, AbortSignal.timeout(5000)]) })
              .then(response => console.warn("Geoapify tile load error status:", response.status))
              .catch(() => { if (!disposed) console.warn("Geoapify tile load error status: unavailable (network/CORS)") })
          }
        })
        .on("tileload", () => { if (!disposed) { tileFailures = 0; setStatus("ready") } })
        .addTo(instance)

      const commit = (lat: number, lng: number) => {
        const next = { latitude: lat, longitude: lng }
        if (latest.current.disabled || !validPoint(next)) return
        marker.current?.setLatLng([lat, lng])
        latest.current.onChange(next)
      }
      instance.on("click", event => { if (latest.current.clickable) commit(event.latlng.lat, event.latlng.lng) })
      const markerImage = safeImageUrl(markerImageUrl)
      const pin = L.marker(position, {
        draggable: latest.current.draggable && !latest.current.disabled,
        keyboard: true,
        title: label,
        icon: L.divIcon({ className: `ip-location-marker${markerKind === "rider" ? " ip-location-marker--rider" : ""}${markerImage ? " ip-location-marker--restaurant" : ""}`, html: `<span aria-hidden="true">${markerImage ? `<img src="${markerImage}" alt=""/>` : markerKind === "rider" ? "R" : audience === "admin" ? "◆" : "●"}</span>`, iconSize: markerKind === "rider" ? [46, 46] : [32, 42], iconAnchor: markerKind === "rider" ? [23, 23] : [16, 42] }),
      }).on("dragend", () => { const value = pin.getLatLng(); commit(value.lat, value.lng) })
      marker.current = pin
      if (latest.current.point) pin.addTo(instance)

      if (originPoint && validPoint(originPoint) && (originPoint.latitude !== 0 || originPoint.longitude !== 0)) {
        const image = safeImageUrl(originImageUrl)
        originMarker.current = L.marker([originPoint.latitude, originPoint.longitude], {
          keyboard: true,
          title: originLabel,
          interactive: false,
          icon: L.divIcon({ className: "ip-origin-marker", html: `<span aria-hidden="true">${image ? `<img src="${image}" alt=""/>` : "R"}</span>`, iconSize: [30, 30], iconAnchor: [15, 15] }),
        }).addTo(instance)
      }

      resize = new ResizeObserver(() => instance.invalidateSize({ pan: false }))
      resize.observe(element.current)
      visibility = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) instance.invalidateSize({ pan: false }) })
      visibility.observe(element.current)
      frame = requestAnimationFrame(() => instance.invalidateSize({ pan: false }))
      setMounted(true)
    }).catch(() => { if (!disposed) setStatus("error") })
    return () => {
      disposed = true
      diagnosticAbort.abort()
      resize?.disconnect()
      visibility?.disconnect()
      if (frame !== undefined) cancelAnimationFrame(frame)
      map.current?.remove()
      map.current = null
      marker.current = null
      originMarker.current = null
      circle.current = null
    }
  }, [tileKey, audience, label, markerKind, markerImageUrl, originPoint, originImageUrl, originLabel, zoom])

  const latitude = point?.latitude, longitude = point?.longitude, centerLat = center?.latitude, centerLng = center?.longitude
  useEffect(() => {
    const instance = map.current, pin = marker.current
    if (!instance || !pin) return
    if (disabled || !draggable) pin.dragging?.disable(); else pin.dragging?.enable()
    if (latitude != null && longitude != null && validPoint({ latitude, longitude })) {
      pin.setLatLng([latitude, longitude]).addTo(instance)
      instance.setView([latitude, longitude], zoom, { animate: markerKind === "rider" })
    } else {
      pin.remove()
      if (centerLat != null && centerLng != null && validPoint({ latitude: centerLat, longitude: centerLng }) && (centerLat !== 0 || centerLng !== 0)) instance.setView([centerLat, centerLng], 14, { animate: false })
    }
    circle.current?.remove(); circle.current = null
    if (latitude != null && longitude != null && radiusMeters && radiusMeters > 0) {
      let cancelled = false
      void import("leaflet").then(L => { if (!cancelled && map.current === instance) circle.current = L.circle([latitude, longitude], { radius: radiusMeters, color: "#a92114", weight: 1, fillOpacity: .08 }).addTo(instance) })
      return () => { cancelled = true }
    }
  }, [latitude, longitude, centerLat, centerLng, radiusMeters, disabled, draggable, markerKind, zoom, mounted])

  return <div className={`ip-location-map ip-location-map--${audience}`}>
    <button className="ip-location-map__pan" type="button" aria-pressed={panEnabled} onClick={() => { const next = !panEnabled; setPanEnabled(next); if (next) map.current?.dragging.enable(); else map.current?.dragging.disable() }}>{panEnabled ? "Scroll page" : "Pan map"}</button>
    {tileKey ? <div ref={element} className="ip-location-map__surface" role="region" aria-label={`${label} map`} style={{ height }}/> : null}
    {(!tileKey.trim() || status === "error") && <p role="status">{audience === "admin" && !tileKey.trim() ? "Map service is not configured. Add the Geoapify map key." : "Map service is unavailable."}</p>}
    {tileKey && status === "loading" && <p className="ip-location-map__loading" role="status"><AppLoader active delay={0} label="Loading map"/>Loading map…</p>}
  </div>
}
