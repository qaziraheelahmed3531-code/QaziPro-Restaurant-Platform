"use client"

import Link from "next/link"
import { AppLoader } from "@italian-pizza/shared/app-loader"
import { useRouter } from "next/navigation"
import { Coins, Home, LocateFixed, LoaderCircle, MapPin, Plus, Store } from "lucide-react"
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react"

import { LocationMap } from "@/components/location/location-map"
import { useCheckoutLocation } from "@/lib/location/use-checkout-location"
import { PriceSummary } from "@/components/cart/price-summary"
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav"
import { SiteHeader } from "@/components/layout/site-header"
import { useApp } from "@/components/providers/app-provider"
import { Button } from "@/components/ui/button"
import { OrderTypeToggle } from "@/components/ui/order-type-toggle"
import { formatRupees } from "@/lib/format"
import { useAddressAutocomplete } from "@/lib/location/use-address-autocomplete"
import { createLocalOrder } from "@/lib/orders/local-orders"
import { createRemoteOrder } from "@/lib/orders/remote-orders"
import type { AddressSuggestion } from "@/lib/geoapify/types"
import type { LoyaltyWalletSnapshot } from "@/lib/loyalty/types"
import type { SavedAddress, SavedAddressLabel } from "@/types"

type AddressDraft = Pick<SavedAddress, "addressLine1" | "addressLine2" | "landmark" | "instructions">

const emptyAddress: AddressDraft = { addressLine1: "", addressLine2: "", landmark: "", instructions: "" }

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function AddressAutocompleteInput({
  value,
  onChange,
  onSelect,
  areaId,
}: {
  areaId?: string
  value: string
  onChange: (value: string) => void
  onSelect: (suggestion: AddressSuggestion) => void
}) {
  const listId = useId()
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const { suggestions, loading, error } = useAddressAutocomplete(open ? value : "", areaId)

  const selectSuggestion = (suggestion: AddressSuggestion) => {
    onSelect(suggestion)
    setOpen(false)
    setActiveIndex(-1)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setOpen(false)
      setActiveIndex(-1)
      return
    }
    if (!suggestions.length) return
    if (event.key === "ArrowDown") {
      event.preventDefault()
      setOpen(true)
      setActiveIndex((current) => Math.min(suggestions.length - 1, current + 1))
    }
    if (event.key === "ArrowUp") {
      event.preventDefault()
      setActiveIndex((current) => Math.max(0, current - 1))
    }
    if (event.key === "Enter" && open && activeIndex >= 0 && suggestions[activeIndex]) {
      event.preventDefault()
      selectSuggestion(suggestions[activeIndex])
    }
  }

  const showSuggestions = open && value.trim().length >= 3
  return (
    <div className="address-autocomplete">
      <div className="address-autocomplete__control">
        <input
          value={value}
          onChange={(event) => { onChange(event.target.value); setOpen(true); setActiveIndex(-1) }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          required
          aria-label="Search delivery address"
          onBlur={() => setOpen(false)}
          placeholder="Search your address or landmark..."
          autoComplete="address-line1"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showSuggestions}
          aria-controls={listId}
          aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
        />
        {loading && <LoaderCircle className="address-autocomplete__spinner" aria-label="Loading address suggestions" />}
      </div>
      {showSuggestions && (
        <div className="address-suggestions" id={listId} role="listbox" aria-label="Address suggestions">
          {suggestions.map((suggestion, index) => (
            <button
              id={`${listId}-${index}`}
              key={suggestion.id}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "is-active" : undefined}
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => selectSuggestion(suggestion)}
            >
              <MapPin aria-hidden="true" />
              <span><strong>{suggestion.label}</strong><small>{suggestion.description}</small></span>
            </button>
          ))}
          {!loading && suggestions.length === 0 && !error && <p>Keep typing your address manually, or try a nearby landmark.</p>}
          {error && <p>{error} Please use the map or current location.</p>}
        </div>
      )}
    </div>
  )
}

export function CheckoutPage() {
  const app = useApp()
  const router = useRouter()
  const checkoutAttemptId = useRef<string | null>(null)
  const [payment, setPayment] = useState<"cod" | "online">("cod")
  const [placing, setPlacing] = useState(false)
  const [address, setAddress] = useState<AddressDraft>(emptyAddress)
  const location = useCheckoutLocation(value => setAddress(current => ({ ...current, addressLine1: value })))
  const addressCoordinates = location.coordinates
  const [saveLabel, setSaveLabel] = useState<SavedAddressLabel>("home")
  const [addressMessage, setAddressMessage] = useState("")
  const [loyalty, setLoyalty] = useState<LoyaltyWalletSnapshot | null>(null)
  const [redeemCoins, setRedeemCoins] = useState(0)
  const baseCanSubmit = app.storefront.orderPersistence !== "unavailable" && app.storefront.branch.isOpen && (app.orderType === "pickup" || Boolean(addressCoordinates && app.deliveryQuoteStatus === "success"))
  const eligibleForCoins = Math.max(0, app.subtotal - app.discount)
  const maxRedeemValue = loyalty ? Math.floor(eligibleForCoins * loyalty.maxRedeemPercent / 100) : 0
  const maxRedeemCoins = loyalty ? Math.min(loyalty.balanceCoins, Math.floor(maxRedeemValue / loyalty.coinValuePkr)) : 0
  const loyaltyDiscount = loyalty ? redeemCoins * loyalty.coinValuePkr : 0
  const checkoutTotal = Math.max(0, app.total - loyaltyDiscount)
  const loyaltySelectionValid = !loyalty || redeemCoins === 0 || redeemCoins >= loyalty.minimumRedeemCoins
  const canSubmit = baseCanSubmit && loyaltySelectionValid

  useEffect(() => {
    if (!app.authResolved || !app.authUserId) return
    let active = true
    void fetch("/api/loyalty", { cache: "no-store" }).then(async (response) => {
      if (!response.ok) return
      const result = await response.json() as { wallet?: LoyaltyWalletSnapshot }
      if (active) setLoyalty(result.wallet ?? null)
    }).catch(() => undefined)
    return () => { active = false }
  }, [app.authResolved, app.authUserId])

  const updateAddress = (field: keyof AddressDraft, value: string) => setAddress((current) => ({ ...current, [field]: value }))

  const reuseAddress = (saved: SavedAddress) => {
    app.activateAddress(saved.id)
    setSaveLabel(saved.label)
    setAddress({ addressLine1: saved.addressLine1, addressLine2: saved.addressLine2, landmark: saved.landmark, instructions: saved.instructions })
    if (saved.coordinates) void location.resolve({ ...saved.coordinates, source: "SAVED_ADDRESS" }, saved.addressLine1)
    else void location.loadLegacyAddress(saved.addressLine1, saved.areaId)
    setAddressMessage(`${titleCase(saved.label)} address loaded.`)
  }

  const saveCurrentAddress = async () => {
    if (!app.selectedArea || !address.addressLine1.trim() || !addressCoordinates) {
      setAddressMessage("Select an area and verify your delivery pin before saving.")
      return
    }
    try {
      await app.saveAddress({ label: saveLabel, areaId: app.selectedArea.id, addressLine1: address.addressLine1.trim(), addressLine2: address.addressLine2.trim(), landmark: address.landmark.trim(), instructions: address.instructions.trim(), coordinates: addressCoordinates })
      setAddressMessage(`${titleCase(saveLabel)} address saved.`)
    } catch { setAddressMessage("Address could not be saved. Please retry.") }
  }

  const placeOrder = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (placing || !canSubmit) return
    if (app.orderType === "delivery" && !app.selectedArea) {
      setAddressMessage("Select your delivery area before placing the order.")
      app.openLocation()
      return
    }
    setPlacing(true)
    try {
      const formData = new FormData(event.currentTarget)
      const deliveryAddress = app.orderType === "delivery" ? [address.addressLine1, address.addressLine2, address.landmark].map((value) => value.trim()).filter(Boolean).join(", ") : null
      const customerName = String(formData.get("name") ?? "").trim()
      const customerPhone = String(formData.get("phone") ?? "").trim()
      let orderId: string
      if (app.storefront.orderPersistence === "database" && app.storefront.branch.id) {
        checkoutAttemptId.current ??= crypto.randomUUID()
        const coordinates = app.orderType === "delivery" ? addressCoordinates : undefined
        orderId = await createRemoteOrder({
          idempotencyKey: checkoutAttemptId.current,
          branchId: app.storefront.branch.id,
          serviceMode: app.orderType === "pickup" ? "PICKUP" : "DELIVERY",
          paymentMethod: "CASH_ON_DELIVERY",
          customerName,
          customerPhone,
          customerEmail: String(formData.get("email") ?? "").trim(),
          deliveryAreaId: app.selectedArea?.databaseId,
          deliveryAddress,
          deliveryInstructions: address.instructions,
          locationSource: coordinates?.source,
          latitude: coordinates?.latitude,
          longitude: coordinates?.longitude,
          promoCode: app.promoCode,
          loyaltyCoinsToRedeem: redeemCoins,
          items: app.cart.map((item) => ({ itemKind: item.itemKind ?? "product", productId: item.productId, variantId: item.variantId, quantity: item.quantity, modifiers: item.modifierSelections ?? [] })),
        })
      } else if (app.storefront.orderPersistence === "local-demo") {
        const order = createLocalOrder({ items: app.cart, subtotal: app.subtotal, discount: app.discount, deliveryFee: app.deliveryFee, total: app.total, deliveryAddress, areaLabel: app.selectedArea?.label ?? null, serviceMode: app.orderType, paymentMethod: "cod", customerName, customerPhone })
        orderId = order.id
      } else {
        throw new Error("Ordering is temporarily unavailable. Your cart is safe; please retry shortly.")
      }
      app.clearCart()
      router.push(`/orders/${encodeURIComponent(orderId)}`)
    } catch (error) {
      setPlacing(false)
      setAddressMessage(error instanceof Error ? error.message : "The order could not be placed. Please retry.")
    }
  }

  if (app.cart.length === 0) {
    return (
      <div className="app-shell inner-page"><SiteHeader /><main className="empty-state"><Home aria-hidden="true" /><h1>Your cart is empty</h1><p>Add something from the menu before starting checkout.</p><Link className="button-link" href="/">Browse the menu</Link></main><MobileBottomNav /></div>
    )
  }

  return (
    <div className="app-shell inner-page">
      <SiteHeader />
      <main className="commerce-page checkout-page">
        <div className="page-title"><h1>Complete your order</h1><p>Your area and full address stay separate for a faster delivery handoff.</p></div>
        <form id="checkout-form" className="commerce-grid" onSubmit={placeOrder}>
          <div className="commerce-main">
            <section className="commerce-card checkout-order-type">
              <div className="card-heading"><div><span>1</span><div><h2>Order type</h2><p>Choose delivery or pickup.</p></div></div></div>
              <OrderTypeToggle value={app.orderType} onChange={app.setOrderType} />
            </section>

            <section className="commerce-card form-card">
              <div className="card-heading"><div><span>2</span><div><h2>Contact information</h2><p>We’ll use this to identify and coordinate your order.</p></div></div></div>
              <div className="form-grid">
                <label><span>Full name <em>Required</em></span><input name="name" placeholder="Your full name" required autoComplete="name" /></label>
                <label><span>Phone <em>Required</em></span><input name="phone" placeholder="03XX XXXXXXX" required autoComplete="tel" inputMode="tel" /></label>
                <label className="form-grid__wide"><span>Email <small>Optional</small></span><input name="email" placeholder="you@example.com" autoComplete="email" type="email" /></label>
              </div>
            </section>

            <section className="commerce-card address-card">
              <div className="card-heading"><div><span>3</span><div><h2>{app.orderType === "delivery" ? "Delivery address" : "Pickup location"}</h2><p>{app.orderType === "delivery" ? "Choose where we should deliver." : "Collect your order from the restaurant."}</p></div></div></div>

              {app.orderType === "delivery" ? (
                <>
                  {app.savedAddresses.length > 0 && (
                    <div className="saved-addresses" aria-label="Saved addresses">
                      <h3>Saved addresses</h3>
                      <div>{app.savedAddresses.map((saved) => (
                        <button key={saved.id} type="button" className={app.activeAddressId === saved.id ? "saved-address is-active" : "saved-address"} onClick={() => reuseAddress(saved)}>
                          <span><Home aria-hidden="true" /></span><strong>{titleCase(saved.label)}</strong><small>{saved.addressLine1}</small>
                        </button>
                      ))}</div>
                      {app.activeAddressId && <Button type="button" variant="ghost" onClick={() => { app.removeSavedAddress(app.activeAddressId!); setAddressMessage("Saved address removed.") }}>Remove selected address</Button>}
                    </div>
                  )}

                  <div className="form-grid address-grid">
                    <small className="form-grid__wide">Delivering in: {app.selectedArea?.label ?? "Select a delivery area"}, {app.storefront.branch.city}</small>
                    <div className="form-grid__wide"><AddressAutocompleteInput areaId={app.selectedAreaId ?? undefined} value={address.addressLine1} onChange={value => { updateAddress("addressLine1", value); location.invalidate() }} onSelect={suggestion => { const addressText = suggestion.formattedAddress || [suggestion.label, suggestion.description].filter(Boolean).join(", "); if (suggestion.coordinates) void location.resolve({ ...suggestion.coordinates, source: "AUTOCOMPLETE" }, addressText); else if (suggestion.placeId) void location.resolve(undefined,addressText,suggestion.placeId) }} /></div>
                    <div className="checkout-pin-block">
                      <Button type="button" variant="outline" disabled={location.busy} onClick={() => void location.resolve()}>{location.busy ? <AppLoader active label="Checking location" /> : <LocateFixed aria-hidden="true" />}{location.busy ? "Checking location…" : "Use Current Location"}</Button>
                      <LocationMap point={location.point} center={app.selectedArea?.centerLatitude != null && app.selectedArea.centerLongitude != null ? { latitude: app.selectedArea.centerLatitude, longitude: app.selectedArea.centerLongitude } : app.storefront.branch.originLatitude != null && app.storefront.branch.originLongitude != null ? { latitude: app.storefront.branch.originLatitude, longitude: app.storefront.branch.originLongitude } : undefined} onChange={point => { void location.resolve({ ...point, source: "MAP_PIN" }) }} />
                      <div className="checkout-pin-status" role="status" data-valid={Boolean(addressCoordinates)} data-invalid={!location.busy && !addressCoordinates && Boolean(location.point)}>
                        {location.mismatch ? `This location is in ${location.mismatch.areaLabel}. Switch your delivery area to continue.` : (addressCoordinates && app.deliveryQuoteError ? app.deliveryQuoteError : location.message)}
                        {location.mismatch && <Button type="button" variant="outline" onClick={location.confirmSwitch}>Switch to {location.mismatch.areaLabel}</Button>}
                        {!location.busy && location.point && !location.mismatch && (!addressCoordinates || app.deliveryQuoteStatus === "unavailable") && <Button type="button" variant="ghost" onClick={location.retry}>Retry location check</Button>}
                      </div>
                    </div>
                    <details className="form-grid__wide checkout-extra-details"><summary>+ Add delivery details</summary><label className="form-grid__wide"><span>House / Shop / Building <small>Optional</small></span><input value={address.addressLine2} onChange={(event) => updateAddress("addressLine2", event.target.value)} placeholder="Sector, mohallah, apartment or floor" autoComplete="address-line2" /></label>
                    <label className="form-grid__wide"><span>Landmark <small>Optional but useful</small></span><input value={address.landmark} onChange={(event) => updateAddress("landmark", event.target.value)} placeholder="Near mosque, school or a known shop" /></label>
                    <label className="form-grid__wide textarea-field"><span>Delivery instructions <small>Optional</small></span><textarea value={address.instructions} onChange={(event) => updateAddress("instructions", event.target.value)} placeholder="Gate color, calling preference or rider note" /></label></details>
                  </div>

                  {addressCoordinates && <p className="address-message">Selected address: {address.addressLine1}</p>}
                  {addressCoordinates && <p className="address-message delivery-calculation" role="status"><AppLoader active={app.deliveryQuoteStatus === "loading"} label="Calculating delivery" />{app.deliveryQuoteStatus === "loading" ? "Calculating delivery…" : app.deliveryQuote ? `${app.deliveryQuote.distanceKm} km · ${formatRupees(app.deliveryQuote.deliveryFee)} delivery` : ""}</p>}

                  <fieldset className="save-address-control">
                    <legend>Save address as</legend>
                    <div>{(["home", "work", "other"] as const).map((label) => <button key={label} type="button" className={saveLabel === label ? "is-selected" : undefined} aria-pressed={saveLabel === label} onClick={() => setSaveLabel(label)}>{titleCase(label)}</button>)}</div>
                    <Button type="button" variant="outline" disabled={!addressCoordinates} onClick={saveCurrentAddress}><Plus aria-hidden="true" /> Save address</Button>
                    <small>Signed-in addresses are saved to your account.</small>
                  </fieldset>
                  {addressMessage && <p className="address-message" role="status">{addressMessage}</p>}
                </>
              ) : (
                <div className="pickup-checkout"><span><Store aria-hidden="true" /></span><div><small>PICKUP LOCATION</small><h3>{app.storefront.branch.restaurantName??app.storefront.business.name}</h3><p>{app.storefront.branch.formattedAddress??app.storefront.branch.city}</p></div></div>
              )}
            </section>

            <fieldset className="commerce-card payment-card">
              <legend><span>4</span><div><strong>Payment method</strong><small>Select how you would like to pay.</small></div></legend>
              <label className={payment === "cod" ? "payment-option is-selected" : "payment-option"}><input type="radio" name="payment" value="cod" checked={payment === "cod"} onChange={() => setPayment("cod")} /><span><strong>Cash on Delivery</strong><small>Pay when your order arrives</small></span></label>
              <label className="payment-option is-disabled"><input type="radio" name="payment" value="online" disabled /><span><strong>Online payment</strong><small>Coming soon</small></span></label>
            </fieldset>

            {loyalty?.enabled && loyalty.redemptionEnabled && <section className="commerce-card loyalty-redemption-card" aria-labelledby="loyalty-redemption-title">
              <header><span><Coins aria-hidden="true" /></span><div><h2 id="loyalty-redemption-title">Use loyalty coins</h2><small>{loyalty.balanceCoins} available · worth Rs {loyalty.balancePkr.toLocaleString("en-PK")}</small></div></header>
              {maxRedeemCoins >= loyalty.minimumRedeemCoins ? <>
                <label className="loyalty-redemption-input"><span className="sr-only">Coins to use</span><input aria-label="Coins to use" type="number" min={0} max={maxRedeemCoins} step={1} value={redeemCoins} onChange={(event) => setRedeemCoins(Math.min(maxRedeemCoins, Math.max(0, Math.floor(Number(event.target.value) || 0))))}/><small>/ {maxRedeemCoins}</small></label>
                <button className="loyalty-maximum" type="button" onClick={() => setRedeemCoins(maxRedeemCoins)}>Use maximum</button>
                {redeemCoins > 0 && <button className="loyalty-clear" type="button" onClick={() => setRedeemCoins(0)}>Don&apos;t use</button>}
                <p className="loyalty-redemption-saving" role="status">{redeemCoins > 0 ? redeemCoins < loyalty.minimumRedeemCoins ? `Minimum ${loyalty.minimumRedeemCoins}` : `Save ${formatRupees(loyaltyDiscount)}` : "Optional"}</p>
              </> : <p className="loyalty-redemption-unavailable">Keep earning—this order can use coins when at least {loyalty.minimumRedeemCoins} are available within the order limit.</p>}
            </section>}
          </div>

          <aside><PriceSummary subtotal={app.subtotal} discount={app.discount} loyaltyDiscount={loyaltyDiscount} deliveryFee={app.deliveryFee} deliveryStatus={app.deliveryQuoteStatus} orderType={app.orderType} total={checkoutTotal} /><Button type="submit" size="lg" disabled={placing || !canSubmit}><AppLoader active={placing} label="Placing order" />{placing ? "Placing order…" : !app.storefront.branch.isOpen ? "Restaurant closed" : app.storefront.orderPersistence === "unavailable" ? "Ordering unavailable" : app.orderType === "delivery" && !addressCoordinates ? "Select a mapped address" : "Place order"}</Button><p className="demo-disclaimer">Final prices and delivery fees are verified securely when the order is placed.</p></aside>
        </form>
      </main>
      <div className="mobile-sticky-action"><span><small>TOTAL</small><strong>{formatRupees(checkoutTotal)}</strong></span><Button type="submit" form="checkout-form" size="lg" disabled={placing || !canSubmit}><AppLoader active={placing} label="Placing order" />{placing ? "Preparing…" : !app.storefront.branch.isOpen ? "Closed" : canSubmit ? "Place order" : "Action required"}</Button></div>
      <MobileBottomNav />
    </div>
  )
}
