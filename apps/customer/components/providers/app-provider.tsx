"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from "react"
import { usePathname } from "next/navigation"
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client"

import { locationSource, validPoint, type LocationSource } from "@italian-pizza/shared/location"
import { getDeliveryQuote } from "@/lib/location/api"
import type { CartLine, Coordinates, DeliveryQuote, LocationArea, OrderType, SavedAddress, StorefrontSnapshot } from "@/types"

type DeliveryQuoteStatus = "idle" | "loading" | "success" | "unavailable"

type AppState = {
  cart: CartLine[]
  orderType: OrderType
  selectedAreaId: string | null
  locationSource: LocationSource
  coordinates: Coordinates | null
  deliveryQuote: DeliveryQuote | null
  deliveryQuoteError: string | null
  deliveryQuoteStatus: DeliveryQuoteStatus
  savedAddresses: SavedAddress[]
  activeAddressId: string | null
  promoCode: string
  promoDiscount: number
  locationOpen: boolean
  locationRequired: boolean
  cartDrawerOpen: boolean
  productId: string | null
  hydrated: boolean
  authUserId: string | null
  authResolved: boolean
}

type PersistedState = Pick<AppState, "cart" | "orderType" | "selectedAreaId" | "locationSource" | "coordinates" | "deliveryQuote" | "promoCode" | "promoDiscount"> & {
  branchId: string | null
  city: string | null
  locationRevision: number | null
}

type Action =
  | { type: "hydrate"; payload: PersistedState; locationInvalidated: boolean }
  | { type: "auth-user"; userId: string | null }
  | { type: "location"; open: boolean }
  | { type: "confirm-pickup" }
  | { type: "cart-drawer"; open: boolean }
  | { type: "product"; productId: string | null }
  | { type: "order-type"; orderType: OrderType }
  | { type: "area"; areaId: string }
  | { type: "detected-area"; areaId: string }
  | { type: "coordinates"; coordinates: Coordinates }
  | { type: "clear-coordinates" }
  | { type: "invalidate-location"; open: boolean }
  | { type: "delivery-quote"; coordinates: Coordinates; quote: DeliveryQuote }
  | { type: "delivery-quote-loading"; coordinates: Coordinates }
  | { type: "delivery-quote-unavailable"; coordinates: Coordinates; error: string }
  | { type: "save-address"; address: SavedAddress }
  | { type: "addresses"; addresses: SavedAddress[] }
  | { type: "remove-address"; addressId: string }
  | { type: "active-address"; addressId: string }
  | { type: "add"; line: CartLine }
  | { type: "quantity"; lineId: string; quantity: number }
  | { type: "remove"; lineId: string }
  | { type: "sanitize-cart"; productIds: string[] }
  | { type: "promo"; code: string; discount: number }
  | { type: "clear" }
  | { type: "close-overlays" }

const initialCart: CartLine[] = []

const initialState: AppState = {
  cart: initialCart,
  orderType: "delivery",
  selectedAreaId: null,
  locationSource: "MANUAL_AREA",
  coordinates: null,
  deliveryQuote: null,
  deliveryQuoteError: null,
  deliveryQuoteStatus: "idle",
  savedAddresses: [],
  activeAddressId: null,
  promoCode: "",
  promoDiscount: 0,
  locationOpen: false,
  locationRequired: true,
  cartDrawerOpen: false,
  productId: null,
  hydrated: false,
  authUserId: null,
  authResolved: false,
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return { ...state, ...action.payload, locationOpen:action.locationInvalidated, locationRequired:action.locationInvalidated, savedAddresses: [], activeAddressId: null, deliveryQuote: null, deliveryQuoteError: null, deliveryQuoteStatus: action.payload.coordinates ? "loading" : "idle", hydrated: true }
    case "auth-user":
      return action.userId === state.authUserId && state.authResolved ? state : { ...state, authUserId: action.userId, authResolved: true, savedAddresses: [], activeAddressId: null }
    case "location":
      return action.open ? { ...state, locationOpen:true,cartDrawerOpen:false,productId:null } : state.locationRequired ? state : { ...state,locationOpen:false }
    case "confirm-pickup":
      return { ...state,orderType:"pickup",selectedAreaId:null,coordinates:null,deliveryQuote:null,deliveryQuoteError:null,deliveryQuoteStatus:"idle",locationOpen:false,locationRequired:false }
    case "cart-drawer":
      return action.open && state.locationRequired ? state : { ...state, cartDrawerOpen: action.open, locationOpen: action.open ? false : state.locationOpen, productId: action.open ? null : state.productId }
    case "product":
      return action.productId && state.locationRequired ? state : { ...state, productId: action.productId, cartDrawerOpen: action.productId ? false : state.cartDrawerOpen, locationOpen: action.productId ? false : state.locationOpen }
    case "order-type":
      return { ...state, orderType: action.orderType, locationRequired:true }
    case "area":
      return { ...state, selectedAreaId: action.areaId, locationSource: "MANUAL_AREA", coordinates: null, deliveryQuote: null, deliveryQuoteError: null, deliveryQuoteStatus: "idle", locationOpen: false, locationRequired:false }
    case "detected-area":
      return action.areaId === state.selectedAreaId ? state : { ...state, selectedAreaId: action.areaId, locationSource: "MANUAL_AREA", coordinates: null, deliveryQuote: null, deliveryQuoteError: null, deliveryQuoteStatus: "idle" }
    case "coordinates":
      return { ...state, locationSource: locationSource(action.coordinates.source), coordinates: action.coordinates, deliveryQuote: null, deliveryQuoteError: null, deliveryQuoteStatus: "loading" }
    case "clear-coordinates":
      return { ...state, locationSource: "MANUAL_AREA", coordinates: null, deliveryQuote: null, deliveryQuoteError: null, deliveryQuoteStatus: "idle" }
    case "invalidate-location":
      return { ...state,selectedAreaId:null,activeAddressId:null,locationSource:"MANUAL_AREA",coordinates:null,deliveryQuote:null,deliveryQuoteError:null,deliveryQuoteStatus:"idle",locationOpen:action.open,locationRequired:action.open }
    case "delivery-quote-loading":
      return sameCoordinates(state.coordinates, action.coordinates) ? { ...state, deliveryQuote:null,deliveryQuoteStatus:"loading",deliveryQuoteError:null } : state
    case "delivery-quote":
      return sameCoordinates(state.coordinates, action.coordinates)
        ? { ...state, deliveryQuote: action.quote, deliveryQuoteError: null, deliveryQuoteStatus: "success" }
        : state
    case "delivery-quote-unavailable":
      return sameCoordinates(state.coordinates, action.coordinates)
        ? { ...state, deliveryQuote: null, deliveryQuoteError: action.error, deliveryQuoteStatus: "unavailable" }
        : state
    case "save-address":
      return { ...state, savedAddresses: [...state.savedAddresses.filter((address) => address.label !== action.address.label), action.address], activeAddressId: action.address.id }
    case "addresses":
      return { ...state, savedAddresses: action.addresses, activeAddressId: state.activeAddressId ?? action.addresses.find((address) => address.label === "home")?.id ?? action.addresses[0]?.id ?? null }
    case "remove-address":
      return { ...state, savedAddresses: state.savedAddresses.filter((address) => address.id !== action.addressId), activeAddressId: state.activeAddressId === action.addressId ? null : state.activeAddressId }
    case "active-address": {
      const address = state.savedAddresses.find((item) => item.id === action.addressId)
      return address ? { ...state, activeAddressId: address.id, selectedAreaId: address.areaId } : state
    }
    case "add":
      return { ...state, cart: [...state.cart, action.line], promoCode: "", promoDiscount: 0, productId: null, cartDrawerOpen: true }
    case "quantity":
      return { ...state, cart: state.cart.map((line) => line.lineId === action.lineId ? { ...line, quantity: action.quantity } : line).filter((line) => line.quantity > 0), promoCode: "", promoDiscount: 0 }
    case "remove":
      return { ...state, cart: state.cart.filter((line) => line.lineId !== action.lineId), promoCode: "", promoDiscount: 0 }
    case "sanitize-cart": {
      const allowed = new Set(action.productIds)
      return { ...state, cart: state.cart.filter((line) => allowed.has(line.productId)) }
    }
    case "promo":
      return { ...state, promoCode: action.code, promoDiscount: action.discount }
    case "clear":
      return { ...state, cart: [], promoCode: "", promoDiscount: 0 }
    case "close-overlays":
      return { ...state, locationOpen: state.locationRequired ? true : false, cartDrawerOpen: false, productId: null }
  }
}

type AppContextValue = AppState & {
  storefront: StorefrontSnapshot
  selectedArea: LocationArea | undefined
  locationLabel: string
  cartCount: number
  subtotal: number
  discount: number
  deliveryFee: number | null
  total: number
  openLocation: () => void
  closeLocation: () => void
  confirmPickup: () => void
  openCart: () => void
  closeCart: () => void
  openProduct: (productId: string) => void
  closeProduct: () => void
  setOrderType: (orderType: OrderType) => void
  selectArea: (areaId: string, coordinates?: Coordinates) => void
  selectDetectedArea: (areaId: string) => void
  setCoordinates: (coordinates: Coordinates) => void
  clearCoordinates: () => void
  saveAddress: (address: Omit<SavedAddress, "id" | "city">) => Promise<void>
  activateAddress: (addressId: string) => void
  removeSavedAddress: (addressId: string) => void
  addCartLine: (line: Omit<CartLine, "lineId">) => void
  updateQuantity: (lineId: string, quantity: number) => void
  removeLine: (lineId: string) => void
  applyPromo: (code: string, discount: number) => void
  clearCart: () => void
}

const AppContext = createContext<AppContextValue | null>(null)
const storageKey = "italian-pizza-demo-state-v2"

function safePersistedState(value: unknown): PersistedState {
  const saved = value && typeof value === "object" ? value as Partial<PersistedState> : {}
  return {
    cart: Array.isArray(saved.cart) ? saved.cart.filter((line) => line && typeof line === "object" && !String((line as CartLine).lineId).startsWith("demo-")) as CartLine[] : initialState.cart,
    orderType: saved.orderType === "pickup" ? "pickup" : "delivery",
    selectedAreaId: typeof saved.selectedAreaId === "string" ? saved.selectedAreaId : null,
    locationSource: locationSource(saved.locationSource),
    coordinates: saved.coordinates && validPoint(saved.coordinates) ? saved.coordinates : null,
    deliveryQuote: saved.deliveryQuote && typeof saved.deliveryQuote.distanceKm === "number" && typeof saved.deliveryQuote.deliveryFee === "number" ? saved.deliveryQuote : null,
    promoCode: typeof saved.promoCode === "string" ? saved.promoCode : "",
    promoDiscount: typeof saved.promoDiscount === "number" && saved.promoDiscount >= 0 ? saved.promoDiscount : 0,
    branchId: typeof saved.branchId === "string" ? saved.branchId : null,
    city: typeof saved.city === "string" ? saved.city : null,
    locationRevision: typeof saved.locationRevision === "number" ? saved.locationRevision : null,
  }
}

function sameCoordinates(first: Coordinates | null, second: Coordinates) {
  return first?.latitude === second.latitude && first.longitude === second.longitude
}

export function AppProvider({ children, storefront }: { children: ReactNode; storefront: StorefrontSnapshot }) {
  const deliveryPolicyKey=JSON.stringify({branch:storefront.branch.id,origin:[storefront.branch.originLatitude,storefront.branch.originLongitude],free:storefront.branch.freeDistanceKm,rate:storefront.branch.extraKmRate,maximum:storefront.branch.maximumDistanceKm,areas:storefront.deliveryAreas})
  const [state, dispatch] = useReducer(reducer, initialState)
  const pathname = usePathname()
  const previousPathnameRef = useRef(pathname)
  const hydratedLocationContext = useRef<string | null>(null)

  useEffect(() => {
    if (previousPathnameRef.current !== pathname) {
      const previousPathname = previousPathnameRef.current
      previousPathnameRef.current = pathname
      const intentionalCartHandoff = previousPathname === "/cart" && pathname === "/" && state.cartDrawerOpen
      if (!intentionalCartHandoff) dispatch({ type: "close-overlays" })
    }
  }, [pathname, state.cartDrawerOpen])

  useEffect(() => {
    try {
      const contextKey = JSON.stringify([storefront.branch.id,storefront.branch.city,storefront.branch.locationRevision,storefront.deliveryAreas.map(area=>area.id)])
      if (hydratedLocationContext.current === contextKey) return
      const firstVisit = hydratedLocationContext.current === null
      hydratedLocationContext.current = contextKey
      const saved = window.localStorage.getItem(storageKey)
      const payload=safePersistedState(saved ? JSON.parse(saved) : null)
      const selectedActive=Boolean(payload.selectedAreaId&&storefront.deliveryAreas.some(area=>area.id===payload.selectedAreaId))
      const contextMatches=Boolean(payload.branchId===storefront.branch.id&&payload.city?.toLocaleLowerCase()===storefront.branch.city.toLocaleLowerCase()&&payload.locationRevision===(storefront.branch.locationRevision??1))
      const locationInvalidated=!contextMatches||(payload.orderType==="delivery"&&!selectedActive)
      dispatch({ type: "hydrate", payload:locationInvalidated?{...payload,selectedAreaId:null,coordinates:null,deliveryQuote:null,locationSource:"MANUAL_AREA"}:payload,locationInvalidated:locationInvalidated||firstVisit })
    } catch {
      window.localStorage.removeItem(storageKey)
      dispatch({ type: "hydrate", payload: safePersistedState(null), locationInvalidated:true })
    }
  }, [storefront.branch.id, storefront.branch.city, storefront.branch.locationRevision, storefront.deliveryAreas])

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      dispatch({ type: "auth-user", userId: null })
      return
    }
    const supabase = createClient()
    const businessId = storefront.business.id
    let active = true
    const applyUser = (userId: string | null) => {
      if (active) dispatch({ type: "auth-user", userId })
      if (userId && businessId) void supabase.rpc("register_storefront_customer", { p_business_id: businessId })
    }
    void supabase.auth.getUser().then(({ data }) => {
      applyUser(data.user?.id ?? null)
    }).catch(() => applyUser(null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => applyUser(session?.user?.id ?? null))
    return () => { active = false; listener.subscription.unsubscribe() }
  }, [storefront.business.id])

  useEffect(() => {
    if (!state.hydrated || !state.authResolved || !state.authUserId) return
    const controller = new AbortController()
    void fetch("/api/addresses", { signal: controller.signal, headers: { Accept: "application/json" }, cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((result: { addresses?: SavedAddress[] } | null) => dispatch({ type: "addresses", addresses: result?.addresses ?? [] }))
      .catch(() => undefined)
    return () => controller.abort()
  }, [state.authResolved, state.authUserId, state.hydrated])

  useEffect(() => {
    if (!state.hydrated) return
    if (state.orderType === "delivery" && !storefront.branch.deliveryEnabled && storefront.branch.pickupEnabled) dispatch({ type: "order-type", orderType: "pickup" })
    if (state.orderType === "pickup" && !storefront.branch.pickupEnabled && storefront.branch.deliveryEnabled) dispatch({ type: "order-type", orderType: "delivery" })
  }, [state.hydrated, state.orderType, storefront.branch.deliveryEnabled, storefront.branch.pickupEnabled])

  useEffect(() => {
    if (!state.hydrated || storefront.source !== "database") return
    dispatch({ type: "sanitize-cart", productIds: [...storefront.products.map((product) => product.id), ...storefront.deals.map((deal) => deal.id)] })
    if(state.selectedAreaId&&!storefront.deliveryAreas.some(area=>area.id===state.selectedAreaId))dispatch({type:"invalidate-location",open:state.orderType==="delivery"})
  }, [state.hydrated,state.orderType,state.selectedAreaId,storefront.deals,storefront.deliveryAreas,storefront.products,storefront.source])

  useEffect(() => {
    if (!state.hydrated) return
    const persisted: PersistedState = { cart: state.cart, orderType: state.orderType, selectedAreaId: state.selectedAreaId, locationSource: state.locationSource, coordinates: state.coordinates, deliveryQuote: state.deliveryQuote, promoCode: state.promoCode, promoDiscount: state.promoDiscount,branchId:storefront.branch.id,city:storefront.branch.city,locationRevision:storefront.branch.locationRevision??1 }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(persisted))
    } catch {
      // The ordering demo remains usable when browser storage is unavailable.
    }
  }, [state.cart, state.coordinates, state.deliveryQuote, state.hydrated, state.locationSource, state.orderType, state.promoCode, state.promoDiscount, state.selectedAreaId,storefront.branch.city,storefront.branch.id,storefront.branch.locationRevision])

  const addCartLine = useCallback((line: Omit<CartLine, "lineId">) => {
    dispatch({ type: "add", line: { ...line, lineId: crypto.randomUUID() } })
  }, [])

  const saveAddress = useCallback(async (address: Omit<SavedAddress, "id" | "city">) => {
    const saved = { ...address, id: `local-${address.label}`, city: storefront.branch.city }
    const deliveryAreaId = storefront.deliveryAreas.find((area) => area.id === address.areaId)?.databaseId
    if (state.authUserId) {
      const response = await fetch("/api/addresses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...saved, deliveryAreaId, latitude: saved.coordinates?.latitude, longitude: saved.coordinates?.longitude, locationSource: saved.coordinates?.source }) })
      if (!response.ok) throw new Error("Address could not be saved. Please retry.")
      const result = await response.json() as { id: string }
      saved.id = result.id
    }
    if (isSupabaseConfigured()) {
      const current = await createClient().auth.getUser()
      if ((current.data.user?.id ?? null) !== state.authUserId) throw new Error("Your account changed. Please save again.")
    }
    dispatch({ type: "save-address", address: saved })
  }, [state.authUserId, storefront.branch.city, storefront.deliveryAreas])

  const setCoordinates = useCallback((coordinates: Coordinates) => {
    dispatch({ type: "coordinates", coordinates })
  }, [])

  useEffect(() => {
    const coordinates = state.coordinates
    if (!coordinates || !state.hydrated) return
    dispatch({type:"delivery-quote-loading",coordinates})
    const controller = new AbortController()
    void getDeliveryQuote(coordinates, controller.signal, state.selectedAreaId ?? undefined)
      .then((quote) => { if (!controller.signal.aborted) dispatch({ type: "delivery-quote", coordinates, quote }) })
      .catch((error) => { if (!controller.signal.aborted) dispatch({ type: "delivery-quote-unavailable", coordinates, error: error instanceof Error ? error.message : "Delivery fee could not be checked. Please retry." }) })
    return () => controller.abort()
  }, [state.coordinates, state.hydrated, state.selectedAreaId, deliveryPolicyKey])

  const activateAddress = useCallback((addressId: string) => {
    const address = state.savedAddresses.find((item) => item.id === addressId)
    if(address&&!storefront.deliveryAreas.some(area=>area.id===address.areaId)){dispatch({type:"invalidate-location",open:true});return}
    dispatch({ type: "active-address", addressId })
    if (address?.coordinates) setCoordinates({ ...address.coordinates, source: "SAVED_ADDRESS" })
    else dispatch({ type: "clear-coordinates" })
  }, [setCoordinates, state.savedAddresses,storefront.deliveryAreas])

  const selectedArea = storefront.deliveryAreas.find((area) => area.id === state.selectedAreaId)
  const subtotal = state.cart.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
  const discount = Math.min(state.promoDiscount, subtotal)
  const deliveryFee = state.orderType === "pickup" ? 0 : state.deliveryQuote?.deliveryFee ?? null

  const value = useMemo<AppContextValue>(() => ({
    ...state,
    storefront,
    selectedArea,
    locationLabel: !state.hydrated ? "Loading saved location…" : state.orderType === "pickup" ? storefront.branch.name : selectedArea ? `${selectedArea.label}, ${storefront.branch.city}` : `Select your area in ${storefront.branch.city}`,
    cartCount: state.cart.reduce((sum, line) => sum + line.quantity, 0),
    subtotal,
    discount,
    deliveryFee,
    total: Math.max(0, subtotal - discount + (deliveryFee ?? 0)),
    openLocation: () => dispatch({ type: "location", open: true }),
    closeLocation: () => dispatch({ type: "location", open: false }),
    confirmPickup: () => dispatch({ type: "confirm-pickup" }),
    openCart: () => dispatch({ type: "cart-drawer", open: true }),
    closeCart: () => dispatch({ type: "cart-drawer", open: false }),
    openProduct: (productId) => dispatch({ type: "product", productId }),
    closeProduct: () => dispatch({ type: "product", productId: null }),
    setOrderType: (orderType) => dispatch({ type: "order-type", orderType }),
    selectArea: (areaId, coordinates) => { dispatch({ type: "area", areaId }); if (coordinates) setCoordinates(coordinates) },
    selectDetectedArea: (areaId) => dispatch({ type: "detected-area", areaId }),
    setCoordinates,
    clearCoordinates: () => dispatch({ type: "clear-coordinates" }),
    saveAddress,
    activateAddress,
    removeSavedAddress: (addressId) => {
      dispatch({ type: "remove-address", addressId })
      if (state.authUserId) void fetch(`/api/addresses?id=${encodeURIComponent(addressId)}`, { method: "DELETE" }).catch(() => undefined)
    },
    addCartLine,
    updateQuantity: (lineId, quantity) => dispatch({ type: "quantity", lineId, quantity }),
    removeLine: (lineId) => dispatch({ type: "remove", lineId }),
    applyPromo: (code, amount) => dispatch({ type: "promo", code, discount: Math.max(0, amount) }),
    clearCart: () => dispatch({ type: "clear" }),
  }), [activateAddress, addCartLine, deliveryFee, discount, saveAddress, selectedArea, setCoordinates, state, storefront, subtotal])

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp() {
  const value = useContext(AppContext)
  if (!value) throw new Error("useApp must be used inside AppProvider")
  return value
}
