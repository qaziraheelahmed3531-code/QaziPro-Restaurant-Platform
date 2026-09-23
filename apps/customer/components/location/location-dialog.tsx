"use client"

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Check, ChevronDown, LocateFixed, MapPin, Search, Store, X } from "lucide-react"

import { BrandLogo } from "@/components/brand/brand-logo"
import { Button } from "@/components/ui/button"
import { OrderTypeToggle } from "@/components/ui/order-type-toggle"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { BrowserLocationError, getBrowserLocation } from "@/lib/location/get-browser-location"
import { reverseCurrentLocation } from "@/lib/location/api"
import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"
import { normalizeLocality } from "@italian-pizza/shared/location"
import { AppLoader } from "@italian-pizza/shared/app-loader"
import { MOTION_DURATION, MOTION_EASE } from "@italian-pizza/shared/motion"
import type { Coordinates, LocationArea, OrderType, StorefrontBusiness, StorefrontBranch } from "@/types"

type DetectionState =
  | "idle"
  | "requesting-permission"
  | "detecting"
  | "reverse-geocoding"
  | "matching"
  | "success"
  | "permission-denied"
  | "timeout"
  | "position-unavailable"
  | "reverse-geocode-error"
  | "no-supported-area"
  | "unsupported"

const activeDetectionStates: DetectionState[] = [
  "requesting-permission",
  "detecting",
  "reverse-geocoding",
  "matching",
]

const detectionMessages: Partial<Record<DetectionState, string>> = {
  "permission-denied": "Location permission is turned off. Please allow location access or select your area manually.",
  timeout: "Location detection timed out. Please retry or select your area manually.",
  "position-unavailable": "Your location is currently unavailable. Please select your area or try again.",
  "reverse-geocode-error": "Your coordinates were detected, but the address could not be identified. Please select your area.",
  "no-supported-area": "This location is outside our delivery area. You can choose another area for a different address.",
  unsupported: "Location detection is not supported in this browser. Please select your area manually.",
}

function locationErrorState(error: unknown, coordinatesFound: boolean): DetectionState {
  if (error instanceof BrowserLocationError) {
    if (error.code === "unavailable") return "position-unavailable"
    return error.code
  }
  return coordinatesFound ? "reverse-geocode-error" : "position-unavailable"
}

export function LocationDialog({
  open,
  orderType,
  selectedAreaId,
  onClose,
  mandatory,
  onPickupSelect,
  onOrderTypeChange,
  onAreaSelect,
  areas,
  business,
  branch,
}: {
  open: boolean
  orderType: OrderType
  selectedAreaId: string | null
  onClose: () => void
  mandatory: boolean
  onPickupSelect: () => void
  onOrderTypeChange: (value: OrderType) => void
  onAreaSelect: (areaId: string, coordinates?: Coordinates) => void
  areas: LocationArea[]
  business: StorefrontBusiness
  branch: StorefrontBranch
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const selectTriggerRef = useRef<HTMLButtonElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([])
  const permissionTimerRef = useRef<number | null>(null)
  const detectionAbortRef = useRef<AbortController | null>(null)
  const listboxId = useId()
  const selectLabelId = useId()
  const reduceMotion = useHydrationSafeReducedMotion()
  const [previousOpen, setPreviousOpen] = useState(open)
  const [draftAreaId, setDraftAreaId] = useState(selectedAreaId)
  const [draftParentId, setDraftParentId] = useState<string | null>(null)
  const [draftCoordinates, setDraftCoordinates] = useState<Coordinates | undefined>()
  const [query, setQuery] = useState("")
  const [selectOpen, setSelectOpen] = useState(false)
  const [detection, setDetection] = useState<DetectionState>("idle")
  const [detectionMessage, setDetectionMessage] = useState("")
  if (previousOpen !== open) {
    setPreviousOpen(open)
    if (open) { setDraftAreaId(selectedAreaId); setDraftParentId(null); setDraftCoordinates(undefined); setDetection("idle") }
  }
  const cityLabel = branch.city || business.city
  const childrenOf = (parentId: string) => areas.filter((area) => area.parentId === parentId)
  const filteredAreas = useMemo(() => {
    const normalized = normalizeLocality(query)
    const scoped = draftParentId ? areas.filter((area) => area.parentId === draftParentId) : areas.filter((area) => !area.parentId)
    if (!normalized) return scoped
    const exact = scoped.filter((area) => [area.label, ...area.aliases].some((name) => normalizeLocality(name) === normalized))
    return exact.length ? exact : scoped.filter((area) => [area.label, ...area.aliases].some((name) => normalizeLocality(name).includes(normalized)))
  }, [areas, draftParentId, query])
  const selectedArea = areas.find((area) => area.id === draftAreaId)
  const isDetecting = activeDetectionStates.includes(detection)

  useBodyScrollLock(open)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (!open) {
      detectionAbortRef.current?.abort()
      detectionAbortRef.current = null
      if (permissionTimerRef.current !== null) window.clearTimeout(permissionTimerRef.current)
      permissionTimerRef.current = null
      return
    }
    if (!dialog.open) dialog.showModal()
  }, [open, selectedAreaId])

  useEffect(() => () => {
    detectionAbortRef.current?.abort()
    if (permissionTimerRef.current !== null) window.clearTimeout(permissionTimerRef.current)
  }, [])

  const closeDialog = () => {
    if (mandatory) return
    detectionAbortRef.current?.abort()
    detectionAbortRef.current = null
    if (permissionTimerRef.current !== null) window.clearTimeout(permissionTimerRef.current)
    permissionTimerRef.current = null
    setDetection("idle")
    setDetectionMessage("")
    setSelectOpen(false)
    setQuery("")
    onClose()
  }

  const openAreaSelect = () => {
    setSelectOpen(true)
    window.requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }))
  }

  const closeAreaSelect = (restoreFocus = false) => {
    setSelectOpen(false)
    setQuery("")
    if (restoreFocus) window.requestAnimationFrame(() => selectTriggerRef.current?.focus({ preventScroll: true }))
  }

  const chooseArea = (areaId: string) => {
    detectionAbortRef.current?.abort()
    const nested = childrenOf(areaId)
    if (nested.length > 0) {
      setDraftParentId(areaId)
      setDraftAreaId(null)
      setQuery("")
      return
    }
    setDraftParentId(null)
    setDraftAreaId(areaId)
    setDraftCoordinates(undefined)
    setDetection("idle")
    setDetectionMessage("")
    closeAreaSelect(true)
  }

  const confirmArea = () => {
    if (draftAreaId && !isDetecting) onAreaSelect(draftAreaId, draftCoordinates)
  }

  const detectLocation = async () => {
    detectionAbortRef.current?.abort()
    if (permissionTimerRef.current !== null) window.clearTimeout(permissionTimerRef.current)

    const controller = new AbortController()
    detectionAbortRef.current = controller
    setDraftAreaId(null)
    setDraftCoordinates(undefined)
    setDetection("requesting-permission")
    setDetectionMessage("")
    permissionTimerRef.current = window.setTimeout(() => setDetection("detecting"), 250)

    let coordinates: Coordinates | null = null
    try {
      coordinates = await getBrowserLocation(controller.signal)
      if (permissionTimerRef.current !== null) window.clearTimeout(permissionTimerRef.current)
      permissionTimerRef.current = null
      if (controller.signal.aborted) return
      setDetection("reverse-geocoding")
      const result = await reverseCurrentLocation(coordinates, controller.signal)
      if (controller.signal.aborted) return
      setDetection("matching")

      if (result.matchedAreaId) {
        const matchedLabel = result.matchedAreaLabel ?? "Supported area"
        setDraftAreaId(result.matchedAreaId)
        setDraftCoordinates({ ...coordinates, source: "GPS" })
        setDetectionMessage(`${matchedLabel} selected`)
        setDetection("success")
        setSelectOpen(false)
        setQuery("")
        return
      }

      setDetection("no-supported-area")
      setDetectionMessage("")
      openAreaSelect()
    } catch (error) {
      if (controller.signal.aborted || (error instanceof DOMException && error.name === "AbortError")) return
      setDetection(locationErrorState(error, coordinates !== null))
      setDetectionMessage("")
    } finally {
      if (detectionAbortRef.current === controller) {
        if (permissionTimerRef.current !== null) window.clearTimeout(permissionTimerRef.current)
        permissionTimerRef.current = null
        detectionAbortRef.current = null
      }
    }
  }

  const focusResult = (index: number) => {
    const nextIndex = Math.max(0, Math.min(filteredAreas.length - 1, index))
    const result = resultRefs.current[nextIndex]
    const results = resultsRef.current
    result?.focus({ preventScroll: true })
    if (!result || !results) return
    if (result.offsetTop < results.scrollTop) results.scrollTop = result.offsetTop
    const resultBottom = result.offsetTop + result.offsetHeight
    if (resultBottom > results.scrollTop + results.clientHeight) {
      results.scrollTop = resultBottom - results.clientHeight
    }
  }

  const handleResultKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown") {
      event.preventDefault()
      focusResult(index + 1)
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      if (index === 0) searchInputRef.current?.focus({ preventScroll: true })
      else focusResult(index - 1)
    }
    if (event.key === "Home") {
      event.preventDefault()
      focusResult(0)
    }
    if (event.key === "End") {
      event.preventDefault()
      focusResult(filteredAreas.length - 1)
    }
    if (event.key === "Escape") {
      event.preventDefault()
      closeAreaSelect(true)
    }
  }

  const switchOrderType = (value: OrderType) => {
    detectionAbortRef.current?.abort()
    setSelectOpen(false)
    setQuery("")
    setDetection("idle")
    setDetectionMessage("")
    onOrderTypeChange(value)
  }

  const activeDetectionLabel = detection === "requesting-permission"
    ? "Waiting for location permission…"
    : detection === "reverse-geocoding"
      ? "Identifying your address…"
      : detection === "matching"
        ? "Matching your delivery area…"
        : "Detecting your location…"

  return (
    <dialog
      ref={dialogRef}
      className="overlay-dialog location-dialog"
      aria-labelledby="location-title"
      onCancel={(event) => {
        event.preventDefault()
        if (!mandatory) closeDialog()
      }}
      onClose={onClose}
    >
      <motion.button
        className="dialog-backdrop"
        style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }}
        type="button"
        tabIndex={-1}
        aria-label="Close location selection"
        onClick={() => { if (!mandatory) closeDialog() }}
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.normal }}
      />

      <motion.section
        className="location-panel location-panel--v5"
        initial={false}
        animate={open ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: 12, scale: 0.985 }}
        transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.normal, ease: MOTION_EASE }}
        onAnimationComplete={() => {
          if (!open) {
            setDetection("idle")
            setDetectionMessage("")
            setSelectOpen(false)
            setQuery("")
            if (dialogRef.current?.open) dialogRef.current.close()
          }
        }}
      >
        <header className="location-panel__header">
          {!mandatory && <button type="button" className="icon-button location-close" onClick={closeDialog} aria-label="Close location selection">
            <X aria-hidden="true" />
          </button>}
          <BrandLogo logoUrl={business.logoUrl ?? undefined} brandName={business.displayName} placement="location" showName={false} />
          <h2 id="location-title">Where would you like to order?</h2>
          <OrderTypeToggle value={orderType} onChange={switchOrderType} />
        </header>

        <div className="location-panel__body">
          {orderType === "delivery" ? (
            <div className="delivery-location-flow">
              <div className="location-flow-heading">
                <strong>Please select your location</strong>
              </div>

              <button type="button" className={`current-location-action${isDetecting ? " is-detecting" : ""}`} onClick={detectLocation} disabled={isDetecting || !branch.deliveryEnabled}>
                {isDetecting ? <AppLoader active label={activeDetectionLabel} /> : <LocateFixed aria-hidden="true" />}
                <span>
                  <strong>{isDetecting ? activeDetectionLabel : "Use Current Location"}</strong>
                </span>
                <ChevronDown aria-hidden="true" />
              </button>

              <AnimatePresence initial={false}>
                {detection !== "idle" && !isDetecting && (
                  <motion.div className={`detection-status is-${detection}`} role="status" initial={reduceMotion ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -2 }} transition={{ duration: reduceMotion ? 0 : 0.16 }}>
                    {detection === "success" ? <Check aria-hidden="true" /> : <LocateFixed aria-hidden="true" />}
                    <span>
                      {detection === "success" && <strong>Current location detected</strong>}
                      <small>{detectionMessage || detectionMessages[detection]}</small>
                    </span>
                    {detection !== "success" && detection !== "no-supported-area" && <button type="button" onClick={detectLocation}>Try Again</button>}
                  </motion.div>
                )}
              </AnimatePresence>

              <label className="location-city-field"><span>City / region</span><input value={cityLabel} readOnly aria-readonly="true" /></label>
              <div className="area-select-field">
                <span id={selectLabelId}>{draftParentId ? `Choose area within ${areas.find((area) => area.id === draftParentId)?.label ?? cityLabel}` : "Select area / sub-region"}</span>
                <button ref={selectTriggerRef} type="button" className={selectOpen ? "area-select-trigger is-open" : "area-select-trigger"} role="combobox" aria-expanded={selectOpen} aria-controls={listboxId} aria-labelledby={`${selectLabelId} area-select-value`} aria-haspopup="listbox" onClick={() => selectOpen ? closeAreaSelect() : openAreaSelect()} onKeyDown={(event) => {
                  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                    event.preventDefault()
                    openAreaSelect()
                  }
                }}>
                  <span id="area-select-value" className={selectedArea ? undefined : "is-placeholder"}>{selectedArea?.label ?? "Choose your area"}</span>
                  <ChevronDown aria-hidden="true" />
                </button>

                <AnimatePresence initial={false}>
                  {selectOpen && (
                    <motion.div className="area-select-popover" initial={reduceMotion ? false : { opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: reduceMotion ? 0 : 0.15 }}>
                      <label className="area-select-search">
                        <Search aria-hidden="true" />
                        {draftParentId && <button type="button" className="area-back-button" onClick={() => { setDraftParentId(null); setQuery("") }}>← All areas</button>}
                        <input ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
                          if (event.key === "ArrowDown" && filteredAreas.length) {
                            event.preventDefault()
                            focusResult(0)
                          }
                          if (event.key === "Escape") {
                            event.preventDefault()
                            closeAreaSelect(true)
                          }
                        }} placeholder={`Search ${draftParentId ? "this area" : "your area"}…`} aria-label="Search supported delivery areas" autoComplete="off" />
                      </label>

                      <div ref={resultsRef} id={listboxId} className="area-results" role="listbox" aria-label="Supported delivery areas">
                        {filteredAreas.length === 0 ? (
                          <div className="area-empty">
                            <Search aria-hidden="true" />
                            <strong>No matching area</strong>
                            <span>Try another spelling or alias.</span>
                            <button type="button" onClick={() => setQuery("")}>Show all areas</button>
                          </div>
                        ) : filteredAreas.map((area, index) => {
                          const selected = draftAreaId === area.id
                          return (
                            <button key={area.id} ref={(element) => { resultRefs.current[index] = element }} type="button" role="option" className={selected ? "area-row is-selected" : "area-row"} aria-selected={selected} onKeyDown={(event) => handleResultKeyDown(event, index)} onClick={() => chooseArea(area.id)}>
                              <MapPin aria-hidden="true" />
                              <span>
                                <strong>{area.label}</strong>
                                {query && area.aliases.length > 0 && <small>Also: {area.aliases.join(", ")}</small>}
                              </span>
                              {selected ? <Check aria-hidden="true" /> : null}
                            </button>
                          )
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="location-confirm">
                <Button size="lg" disabled={!draftAreaId || isDetecting || !branch.deliveryEnabled} onClick={confirmArea}>Start ordering</Button>
                <small>{!branch.deliveryEnabled ? "Delivery is temporarily unavailable." : selectedArea ? `${selectedArea.label}, ${cityLabel}` : "Select an area to continue"}</small>
              </div>
            </div>
          ) : (
            <div className="pickup-panel">
              <span className="pickup-panel__icon"><Store aria-hidden="true" /></span>
              <div>
                <small>PICKUP LOCATION</small>
                <h3>{branch.restaurantName ?? business.name}</h3>
                <p>{branch.formattedAddress ?? branch.city}</p>
              </div>
              <Button size="lg" disabled={!branch.pickupEnabled} onClick={onPickupSelect}>{branch.pickupEnabled ? "Start ordering" : "Pickup unavailable"}</Button>
            </div>
          )}
        </div>
      </motion.section>
    </dialog>
  )
}
