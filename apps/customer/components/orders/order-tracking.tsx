"use client"

import Link from "next/link"
import { Bike, CircleDollarSign, LocateFixed, ReceiptText, Store } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import { useEffect, useState } from "react"

import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav"
import { SiteHeader } from "@/components/layout/site-header"
import { AppLoader } from "@italian-pizza/shared/app-loader"
import { LocationPickerMap } from "@italian-pizza/shared/location-picker-map"
import { formatRupees } from "@/lib/format"
import { useHomeSectionNavigation } from "@/lib/navigation/home-sections"
import { getLocalOrder, subscribeToLocalOrders, type LocalOrder, type LocalOrderStatus } from "@/lib/orders/local-orders"
import { cancelRemoteOrder, fetchRemoteOrder } from "@/lib/orders/remote-orders"
import { createClient } from "@/lib/supabase/client"
import { CommerceSkeleton } from "@/components/loading/commerce-skeleton"
import { OrderFeedback } from "@/components/reviews/order-feedback"

const steps: Array<{ id: Exclude<LocalOrderStatus, "cancelled">; label: string }> = [
  { id: "received", label: "Order received" },
  { id: "confirmed", label: "Confirmed" },
  { id: "preparing", label: "Preparing" },
  { id: "ready", label: "Ready" },
  { id: "out-for-delivery", label: "Out for delivery" },
  { id: "delivered", label: "Delivered" },
]

const statusMessages: Record<LocalOrderStatus, string> = {
  received: "We have received your order.",
  confirmed: "The restaurant has confirmed your order.",
  preparing: "Your food is being prepared.",
  ready: "Your order is ready for the next handoff.",
  "out-for-delivery": "Your order has left the restaurant.",
  delivered: "Your order has been delivered.",
  cancelled: "This order was cancelled.",
}

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function OrderTracking({ orderId }: { orderId: string }) {
  const reduceMotion = useReducedMotion()
  const navigateHome = useHomeSectionNavigation()
  const [order, setOrder] = useState<LocalOrder | null | undefined>(undefined)
  const [now, setNow] = useState(() => Date.now())
  const [cancelBusy, setCancelBusy] = useState(false)
  const [cancelError, setCancelError] = useState("")
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [remoteAvailable, setRemoteAvailable] = useState(false)

  useEffect(() => {
    let active = true
    const supabase = createClient()
    const refresh = async () => {
      const remote = await fetchRemoteOrder(orderId).catch(() => null)
      const { data } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
      if (active) { setRemoteAvailable(Boolean(remote)); setOrder(remote ?? (data.user ? null : getLocalOrder(orderId))) }
    }
    void refresh()
    const unsubscribe = subscribeToLocalOrders(() => { void refresh() })
    const interval = window.setInterval(() => { void refresh() }, 5_000)
    const realtime = supabase.channel(`customer-order-${orderId}`).on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders", filter: `order_number=eq.${orderId}` }, () => { void refresh() }).subscribe()
    const countdown = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { active = false; unsubscribe(); window.clearInterval(interval); window.clearInterval(countdown); void supabase.removeChannel(realtime) }
  }, [orderId])

  if (order === undefined) return <CommerceSkeleton label="Loading your order status" compact />
  if (!order) return (
    <div className="app-shell inner-page">
      <SiteHeader />
      <main className="empty-state"><ReceiptText aria-hidden="true" /><h1>Order not found</h1><p>This browser does not have an order with ID {orderId}.</p><Link className="button-link" href="/orders">View your orders</Link></main>
      <MobileBottomNav />
    </div>
  )

  const visibleSteps = steps.filter(step => order.serviceMode === "delivery" || step.id !== "out-for-delivery").map(step => step.id === "delivered" && order.serviceMode !== "delivery" ? { ...step, label: "Completed" } : step)
  const currentIndex = order.status === "cancelled" ? -1 : visibleSteps.findIndex((step) => step.id === order.status)
  const statusLabel = order.status === "cancelled" ? "Cancelled" : visibleSteps[currentIndex]?.label ?? "Order received"
  const statusMessage = order.status === "delivered" && order.serviceMode !== "delivery" ? "Your order is complete. Thank you for dining with us." : order.status === "ready" && order.serviceMode === "pickup" ? "Your order is ready to collect at the restaurant." : statusMessages[order.status]
  const secondsLeft = Math.max(0, 60 - Math.floor((now - new Date(order.createdAt).getTime()) / 1000))
  const canCancel = remoteAvailable && order.status === "received" && secondsLeft > 0
  const cancelLabel = `Cancel order · 00:${String(secondsLeft).padStart(2, "0")}`
  const progress = order.status === "cancelled" ? 0 : ({ received: 10, confirmed: 25, preparing: 45, ready: 65, "out-for-delivery": 82, delivered: 100 } as Record<string, number>)[order.status] ?? 10
  const restaurantStage=order.serviceMode==="delivery"&&(order.status==="confirmed"||order.status==="preparing"||order.status==="ready")
  const restaurantJourneyTitle=order.status==="confirmed"?"Order confirmed at the restaurant":order.status==="preparing"?"Your food is being prepared":"Food is ready for rider pickup"
  const restaurantJourneyEyebrow=order.status==="ready"?"READY AT RESTAURANT":order.status==="preparing"?"PREPARING AT RESTAURANT":"FOOD JOURNEY"

  return (
    <div className="app-shell inner-page tracking-page">
      <SiteHeader />
      <main className="tracking-main">
        <Link href="/orders" className="breadcrumb">Orders / {order.id}</Link>
        <div className="tracking-title">
          <div><h1>Order {order.id}</h1><p>{order.tokenNumber ? `Token ${String(order.tokenNumber).padStart(3,"0")} · ` : ""}{formatOrderDate(order.createdAt)} · {order.serviceMode === "dine-in" ? "Dine-in" : order.serviceMode === "delivery" ? "Delivery" : "Pickup"}</p></div>
          <div className="tracking-title__states"><span className={`status-pill status-pill--${order.status}`}><i aria-hidden="true" /> {statusLabel}</span><span className={`payment-pill ${order.paymentStatus==="PAID"?"is-paid":""}`}><CircleDollarSign/>{order.paymentStatus==="PAID"?"Paid":"Payment pending"}</span></div>
        </div>

        {canCancel && <section className="tracking-cancel" aria-label="Cancel order"><p>Your order can be cancelled for {secondsLeft} more seconds.</p><button className="button button--outline" type="button" onClick={() => setConfirmCancel(true)} disabled={cancelBusy}>{cancelLabel}</button></section>}
        {!canCancel && remoteAvailable && order.status === "received" && <p className="tracking-cancel-expired" role="status">Your order is being processed.</p>}
        {cancelError && <p className="auth-message auth-message--error" role="alert">{cancelError}</p>}
        {confirmCancel && <div className="cancel-confirm" role="dialog" aria-modal="true" aria-label="Confirm cancellation"><p>Cancel this order?</p><div><button className="button button--outline" type="button" onClick={() => setConfirmCancel(false)}>Keep order</button><button className="button button--danger" type="button" disabled={cancelBusy} onClick={async () => { setCancelBusy(true); setCancelError(""); try { await cancelRemoteOrder(order.id); setConfirmCancel(false); const refreshed = await fetchRemoteOrder(order.id); if (refreshed) setOrder(refreshed) } catch (error) { setCancelError(error instanceof Error ? error.message : "This order could not be cancelled."); setConfirmCancel(false) } finally { setCancelBusy(false) } }}>Yes, cancel</button></div></div>}

        <section className="current-status mobile-only current-status-mobile">
          <span>CURRENT STATUS</span><h2>{statusLabel}</h2><p>{statusMessage}</p><small>{order.riderName?"Live rider GPS appears below when a fresh location is available.":"Status only changes when the restaurant provides a real update."}</small>
        </section>

        {order.status !== "cancelled" && <section className={`tracking-rider${order.status==="out-for-delivery"?" is-out-for-delivery":""}`} aria-label="Order progress visualisation">
          <div className="tracking-rider__ring">
            <svg className="tracking-rider__progress" viewBox="0 0 120 120" aria-hidden="true">
              <defs>
                <linearGradient id="tracking-progress-water" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="var(--ip-brand-secondary)" />
                  <stop offset="48%" stopColor="var(--ip-brand-primary)" />
                  <stop offset="100%" stopColor="#d84a38" />
                </linearGradient>
              </defs>
              <circle className="tracking-ring-track" cx="60" cy="60" r="52"/>
              <motion.circle className="tracking-ring-progress" cx="60" cy="60" r="52" pathLength="100" strokeDasharray="100 100" initial={false} animate={{strokeDashoffset:100-progress}} transition={reduceMotion?{duration:0}:{duration:1.05,ease:[.22,1,.36,1]}}/>
            </svg>
            <div><motion.span key={order.status} initial={reduceMotion?false:{x:-5,scale:.94,opacity:.7}} animate={{x:0,scale:1,opacity:1}} transition={{duration:reduceMotion?0:.3,ease:[.22,1,.36,1]}}>{order.serviceMode === "delivery" ? <Bike aria-hidden="true" /> : <Store aria-hidden="true" />}</motion.span><strong>{currentIndex + 1}/{visibleSteps.length}</strong></div>
          </div>
          <div><span className="eyebrow">STATUS PROGRESS</span><h2>{order.status === "out-for-delivery" ? "Your order is on the way" : order.status === "delivered" ? statusLabel : "Kitchen progress"}</h2><p>Each step reflects a real restaurant update, not an estimated completion time.</p></div>
        </section>}

        {restaurantStage&&<section className="rider-live-tracking food-journey is-restaurant-stage" aria-label="Food journey"><header><span><Store aria-hidden="true"/><span><small>{restaurantJourneyEyebrow}</small><strong>{restaurantJourneyTitle}</strong></span></span><b>At restaurant</b></header>{order.restaurantTracking?<><LocationPickerMap point={{latitude:order.restaurantTracking.latitude,longitude:order.restaurantTracking.longitude}} center={{latitude:order.restaurantTracking.latitude,longitude:order.restaurantTracking.longitude}} onChange={()=>{}} label="Restaurant position" zoom={16} height={260} draggable={false} clickable={false} disabled tileKey={process.env.NEXT_PUBLIC_GEOAPIFY_MAPS_KEY??""} audience="customer" markerKind="location"/><footer><span>{order.status==="ready"?"Your order is ready and still at the restaurant until a rider accepts it.":"Kitchen status is live. This marker shows the restaurant, not rider GPS."}</span><span>{order.restaurantTracking.address??order.branchName}</span></footer></>:<div className="rider-live-waiting"><Store aria-hidden="true"/><span>Your food is at {order.branchName}. Rider GPS will appear after pickup.</span></div>}</section>}

        {(order.status==="out-for-delivery"||order.status==="delivered")&&order.riderName&&<section className="rider-live-tracking" aria-label="Live rider tracking"><header><span><LocateFixed/><span><small>{order.status==="delivered"?"DELIVERY COMPLETED":"LIVE RIDER TRACKING"}</small><strong>{order.riderName}</strong></span></span><b className={order.riderTracking?.active?"is-live":""}>{order.riderTracking?.active?"Live":"Last position"}</b></header>{order.riderTracking?<><LocationPickerMap point={{latitude:order.riderTracking.latitude,longitude:order.riderTracking.longitude}} center={{latitude:order.riderTracking.latitude,longitude:order.riderTracking.longitude}} onChange={()=>{}} label="Rider position" zoom={16} height={300} draggable={false} clickable={false} disabled tileKey={process.env.NEXT_PUBLIC_GEOAPIFY_MAPS_KEY??""} audience="customer" markerKind="rider"/><footer><span>Status updates are based on the rider&apos;s device GPS.</span><time dateTime={order.riderTracking.updatedAt}>Updated {Math.max(0,Math.floor((now-new Date(order.riderTracking.updatedAt).getTime())/1000))} seconds ago</time></footer></>:<div className="rider-live-waiting"><AppLoader active delay={0} label="Waiting for rider GPS"/><span>Rider assigned. Waiting for the first secure GPS update…</span></div>}</section>}

        {order.status !== "cancelled" && <ol className="order-progress" aria-label="Order progress">
          {visibleSteps.map((step, index) => {
            const state = index < currentIndex ? "completed" : index === currentIndex ? "current" : "upcoming"
            return <li key={step.id} className={`is-${state}`} aria-current={state === "current" ? "step" : undefined}><span className="progress-marker" aria-hidden="true" /><strong>{step.label}</strong><small>{state === "current" ? "Current status" : state === "completed" ? "Completed" : "Not started"}</small></li>
          })}
        </ol>}

        <div className="tracking-grid">
          <div>
            <section className="current-status desktop-only"><span>CURRENT STATUS</span><h2>{statusLabel}</h2><p>{statusMessage}</p><small>Status only changes when a real restaurant update becomes available. No automatic or simulated progression is used.</small></section>
            <section className="tracking-card tracking-summary">
              <h2>Order summary</h2>
              {order.items.map((item) => <div key={item.lineId}><span><strong>{item.quantity}× {item.name}</strong>{item.options.length > 0 && <small>{item.options.join(" · ")}</small>}</span><b>{formatRupees(item.unitPrice * item.quantity)}</b></div>)}
              <div><span>Subtotal</span><b>{formatRupees(order.subtotal)}</b></div>
              {order.discount > 0 && <div><span>Discount</span><b>− {formatRupees(order.discount)}</b></div>}
              {order.serviceMode === "delivery" && <div><span>Delivery</span><b>{order.deliveryFee === 0 ? "Free" : order.deliveryFee === null ? "Pending" : formatRupees(order.deliveryFee)}</b></div>}
              <div className="tracking-total"><strong>Total</strong><b>{formatRupees(order.total)}</b></div>
            </section>
          </div>
          <aside>
            <section className="tracking-card"><h2>{order.serviceMode === "dine-in" ? "Dine-in details" : order.serviceMode === "delivery" ? "Delivery details" : "Pickup location"}</h2><h3>{order.serviceMode === "delivery" ? order.areaLabel : order.branchName}</h3><p>{order.deliveryAddress ?? order.branchName}</p><strong className="success-text">Order received</strong></section>
            <section className="tracking-card" id="order-support"><h2>Need help?</h2><p>Contact support with your order ID for the fastest help.</p><Link className="button-link button-link--outline" href="/#support" onClick={(event) => { event.preventDefault(); navigateHome("support") }}>Contact support</Link></section>
          </aside>
        </div>
        {remoteAvailable && order.status === "delivered" && <OrderFeedback key={order.id} orderNumber={order.id} />}
      </main>
      <MobileBottomNav />
    </div>
  )
}
