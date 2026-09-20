import type { Coordinates } from "@/types"

export type BrowserLocationErrorCode = "permission-denied" | "unavailable" | "timeout" | "unsupported"

export class BrowserLocationError extends Error {
  constructor(public code: BrowserLocationErrorCode, message: string) {
    super(message)
    this.name = "BrowserLocationError"
  }
}

const FRESH_POSITION_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  maximumAge: 0,
  timeout: 15000,
}

const ACCEPTABLE_ACCURACY_METERS = 75
const IMPROVEMENT_WINDOW_MS = 10000

function coordinatesFrom(position: GeolocationPosition): Coordinates {
  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
  }
}

function locationError(error: GeolocationPositionError) {
  if (error.code === error.PERMISSION_DENIED) {
    return new BrowserLocationError("permission-denied", "Location permission was denied. You can still select your area below.")
  }
  if (error.code === error.TIMEOUT) {
    return new BrowserLocationError("timeout", "Location detection timed out. Please retry or select your area.")
  }
  return new BrowserLocationError("unavailable", "Your location is currently unavailable. Please select your area.")
}

export function getBrowserLocation(signal?: AbortSignal, singleFix = false): Promise<Coordinates> {
  if (!window.isSecureContext) return Promise.reject(new BrowserLocationError("unsupported", "Use a secure connection for current location, or search your address."))
  if (!("geolocation" in navigator)) {
    return Promise.reject(new BrowserLocationError("unsupported", "Location is not supported by this browser."))
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let watchId: number | null = null
    let improvementTimer: number | null = null

    const cleanup = () => {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      if (improvementTimer !== null) window.clearTimeout(improvementTimer)
      signal?.removeEventListener("abort", abort)
      watchId = null
      improvementTimer = null
    }

    const finish = (coordinates: Coordinates) => {
      if (settled) return
      settled = true
      cleanup()
      resolve(coordinates)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }

    const abort = () => fail(new DOMException("Location request was cancelled.", "AbortError"))
    if (signal?.aborted) {
      abort()
      return
    }
    signal?.addEventListener("abort", abort, { once: true })

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (settled) return
        let best = coordinatesFrom(position)
        if (singleFix || (best.accuracy ?? Number.POSITIVE_INFINITY) <= ACCEPTABLE_ACCURACY_METERS) {
          finish(best)
          return
        }

        watchId = navigator.geolocation.watchPosition(
          (updatedPosition) => {
            if (settled) return
            const updated = coordinatesFrom(updatedPosition)
            if ((updated.accuracy ?? Number.POSITIVE_INFINITY) < (best.accuracy ?? Number.POSITIVE_INFINITY)) best = updated
            if ((best.accuracy ?? Number.POSITIVE_INFINITY) <= ACCEPTABLE_ACCURACY_METERS) finish(best)
          },
          () => finish(best),
          { ...FRESH_POSITION_OPTIONS, timeout: IMPROVEMENT_WINDOW_MS },
        )
        improvementTimer = window.setTimeout(() => finish(best), IMPROVEMENT_WINDOW_MS)
      },
      (error) => fail(locationError(error)),
      FRESH_POSITION_OPTIONS,
    )
  })
}
