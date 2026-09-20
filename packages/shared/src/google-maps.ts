export type GoogleLatLngLiteral = { lat: number; lng: number }

export type GoogleMapMouseEvent = { latLng?: { lat(): number; lng(): number } }
export type GoogleMapListener = { remove: () => void }

export type GoogleMapInstance = {
  setCenter: (center: GoogleLatLngLiteral) => void
  setZoom: (zoom: number) => void
  getZoom: () => number | null
  getCenter: () => { lat(): number; lng(): number } | null
  addListener: (event: string, handler: (event: GoogleMapMouseEvent) => void) => GoogleMapListener
}

export type GoogleMarkerInstance = {
  setMap: (map: GoogleMapInstance | null) => void
  setPosition: (position: GoogleLatLngLiteral) => void
  setDraggable: (draggable: boolean) => void
  addListener: (event: string, handler: (event: GoogleMapMouseEvent) => void) => GoogleMapListener
}

export type GoogleCircleInstance = {
  setMap: (map: GoogleMapInstance | null) => void
  setCenter: (center: GoogleLatLngLiteral) => void
}

export type GoogleMapsApi = {
  maps: {
    Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMapInstance
    Marker: new (options: Record<string, unknown>) => GoogleMarkerInstance
    Circle: new (options: Record<string, unknown>) => GoogleCircleInstance
  }
}

declare global {
  interface Window {
    __italianPizzaGoogleMapsPromise?: Promise<GoogleMapsApi>
    google?: GoogleMapsApi
    __italianPizzaMapsReady?: () => void
    gm_authFailure?: () => void
  }
}

export function loadGoogleMaps(): Promise<GoogleMapsApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("Google Maps is only available in a browser."))
  if (window.google?.maps?.Map) return Promise.resolve(window.google)
  if (window.__italianPizzaGoogleMapsPromise) return window.__italianPizzaGoogleMapsPromise

  const browserKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY?.trim()
  if (!browserKey) return Promise.reject(new Error("Google Maps is not configured for this app."))

  window.__italianPizzaGoogleMapsPromise = new Promise<GoogleMapsApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-italian-pizza-google-maps="true"]')
    const fail = () => {
      window.clearTimeout(timer)
      window.dispatchEvent(new Event("italian-pizza-maps-error"))
      reject(new Error("Google Maps could not be loaded. Check the browser key and allowed referrers."))
    }
    const timer = window.setTimeout(fail, 20_000)
    const finish = () => {
      window.clearTimeout(timer)
      if (window.google?.maps?.Map) resolve(window.google)
      else reject(new Error("Google Maps could not be loaded."))
    }
    window.__italianPizzaMapsReady = finish
    window.gm_authFailure = fail
    if (existing) {
      existing.remove()
    }
    const script = document.createElement("script")
    script.dataset.italianPizzaGoogleMaps = "true"
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(browserKey)}&v=weekly&loading=async&callback=__italianPizzaMapsReady`
    script.addEventListener("error", fail, { once: true })
    document.head.appendChild(script)
  }).catch((error) => {
    window.__italianPizzaGoogleMapsPromise = undefined
    throw error
  })

  return window.__italianPizzaGoogleMapsPromise
}
