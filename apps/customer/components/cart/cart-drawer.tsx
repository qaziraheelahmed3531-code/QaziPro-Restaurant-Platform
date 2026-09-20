"use client"

import Link from "next/link"
import { AppLoader } from "@italian-pizza/shared/app-loader"
import { MOTION_DURATION } from "@italian-pizza/shared/motion"
import { ShoppingBag, Trash2, X } from "lucide-react"
import { motion } from "motion/react"
import { useEffect, useRef, useState } from "react"

import { CartItem } from "@/components/cart/cart-item"
import { PriceSummary } from "@/components/cart/price-summary"
import { useApp } from "@/components/providers/app-provider"
import { Button } from "@/components/ui/button"
import { useBodyScrollLock } from "@/hooks/use-body-scroll-lock"
import { useHydrationSafeReducedMotion } from "@/lib/motion/use-hydration-safe-reduced-motion"

export function CartDrawer() {
  const app = useApp()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const reduceMotion = useHydrationSafeReducedMotion()
  const [promo, setPromo] = useState(app.promoCode)
  const [promoMessage, setPromoMessage] = useState("")
  const [applyingPromo, setApplyingPromo] = useState(false)
  const [entered, setEntered] = useState(false)

  useBodyScrollLock(app.cartDrawerOpen || entered, reduceMotion ? 0 : 420)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (app.cartDrawerOpen) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
      if (!dialog.open) dialog.showModal()
      dialog.querySelector<HTMLButtonElement>("[data-cart-close]")?.focus({ preventScroll: true })
    }
    // The native dialog must have a layout before the percentage slide begins.
    // Two frames also keep a repeated open from animating while display:none.
    let nextFrame = 0
    const frame = requestAnimationFrame(() => { nextFrame = requestAnimationFrame(() => setEntered(app.cartDrawerOpen)) })
    // A close before the entrance starts has no changed motion value and therefore
    // no completion event. Always release that native dialog too.
    const closeFallback = !app.cartDrawerOpen ? window.setTimeout(() => {
      if (dialog.open) { dialog.close(); previousFocusRef.current?.focus({ preventScroll: true }) }
    }, reduceMotion ? 0 : 520) : undefined
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); window.clearTimeout(closeFallback) }
  }, [app.cartDrawerOpen, reduceMotion])

  const drawerTransition = reduceMotion ? { duration: 0 } : { type: "tween" as const, duration: 0.42, ease: [0.22, 1, 0.36, 1] as const }

  const applyPromo = async () => {
    setApplyingPromo(true)
    try {
      const response = await fetch("/api/promotions/validate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: promo, subtotal: app.subtotal }) })
      const result = await response.json() as { valid?: boolean; discount?: number }
      if (!response.ok || !result.valid) { app.applyPromo("", 0); setPromoMessage("This promo code is not valid for the current order."); return }
      app.applyPromo(promo.trim().toUpperCase(), Number(result.discount ?? 0))
      setPromoMessage(`${Number(result.discount ?? 0).toLocaleString("en-PK")} PKR discount applied.`)
    } catch {
      setPromoMessage("Promo validation is temporarily unavailable.")
    } finally { setApplyingPromo(false) }
  }

  return (
    <dialog ref={dialogRef} className="overlay-dialog cart-drawer-dialog" aria-labelledby="cart-drawer-title" onCancel={(event) => { event.preventDefault(); app.closeCart() }} onClose={app.closeCart}>
      <motion.button className="dialog-backdrop" style={{ backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)" }} type="button" tabIndex={-1} aria-label="Close cart" onClick={app.closeCart} initial={false} animate={{ opacity: app.cartDrawerOpen ? 1 : 0 }} transition={{ duration: reduceMotion ? 0 : MOTION_DURATION.normal }} />
      <motion.aside className="cart-drawer" initial={{ x: "100%" }} animate={{ x: entered ? "0%" : "100%" }} transition={drawerTransition} onAnimationComplete={() => { if (!entered && !app.cartDrawerOpen && dialogRef.current?.open) { dialogRef.current.close(); previousFocusRef.current?.focus({ preventScroll: true }) } }}>
        <header className="cart-drawer__header">
          <div><h2 id="cart-drawer-title">Your Cart</h2></div>
          <div>
            {app.cart.length > 0 && <button type="button" className="clear-cart" onClick={app.clearCart}><Trash2 aria-hidden="true" /> Clear cart</button>}
            <button type="button" className="icon-button" data-cart-close onClick={app.closeCart} aria-label="Close cart"><X aria-hidden="true" /></button>
          </div>
        </header>

        <div className="cart-drawer__body">
          {app.cart.length === 0 ? (
            <div className="drawer-empty"><ShoppingBag aria-hidden="true" /><h3>Your cart is empty</h3><p>Choose a pizza, burger or deal and it will appear here.</p><Button onClick={app.closeCart}>Browse the menu</Button></div>
          ) : (
            <>
              <div className="drawer-cart-items">
                {app.cart.map((line) => (
                  <CartItem key={line.lineId} line={line} onQuantity={(quantity) => app.updateQuantity(line.lineId, quantity)} onRemove={() => app.removeLine(line.lineId)} />
                ))}
              </div>
              <section className="drawer-promo" aria-labelledby="drawer-promo-title">
                <label id="drawer-promo-title" htmlFor="drawer-promo">Promo code</label>
                <div><input id="drawer-promo" value={promo} onChange={(event) => setPromo(event.target.value)} placeholder="Enter promo code" /><Button variant="outline" disabled={applyingPromo || !promo.trim()} onClick={() => void applyPromo()}><AppLoader active={applyingPromo} label="Checking promo code" />{applyingPromo ? "Checking…" : "Apply"}</Button></div>
                {promoMessage && <p role="status">{promoMessage}</p>}
              </section>
            </>
          )}
        </div>

        {app.cart.length > 0 && (
          <footer className="cart-drawer__footer">
            <PriceSummary subtotal={app.subtotal} discount={app.discount} deliveryFee={app.deliveryFee} deliveryStatus={app.deliveryQuoteStatus} orderType={app.orderType} total={app.total} title="Bill details" />
            <Link href="/checkout" className="button-link" onClick={app.closeCart}>Checkout</Link>
            <small>Review your delivery details and payment options at checkout.</small>
          </footer>
        )}
      </motion.aside>
    </dialog>
  )
}
