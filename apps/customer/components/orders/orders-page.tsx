"use client"

import Link from "next/link"
import { Clock3, Pizza, ReceiptText } from "lucide-react"
import { useEffect, useState } from "react"
import { AppLoader } from "@italian-pizza/shared/app-loader"

import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav"
import { SiteHeader } from "@/components/layout/site-header"
import { formatRupees } from "@/lib/format"
import { useHomeSectionNavigation } from "@/lib/navigation/home-sections"
import { listLocalOrders, subscribeToLocalOrders, type LocalOrder } from "@/lib/orders/local-orders"
import { fetchRemoteOrders } from "@/lib/orders/remote-orders"
import { createClient } from "@/lib/supabase/client"

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
}

export function OrdersPage() {
  const [orders, setOrders] = useState<LocalOrder[] | null>(null)
  const navigateHome = useHomeSectionNavigation()

  useEffect(() => {
    let active = true
    const refresh = async () => {
      const { data } = await createClient().auth.getUser().catch(() => ({ data: { user: null } }))
      const local = data.user ? [] : listLocalOrders()
      const remote = await fetchRemoteOrders().catch(() => [])
      if (active) setOrders(Array.from(new Map([...remote, ...local].map((order) => [order.id, order])).values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    }
    void refresh()
    const unsubscribe = subscribeToLocalOrders(() => { void refresh() })
    return () => { active = false; unsubscribe() }
  }, [])

  return (
    <div className="app-shell inner-page orders-page">
      <SiteHeader />
      <main className="orders-main">
        <div className="page-title"><span>YOUR ORDERS</span><h1>Orders</h1><p>Track your orders and the guest orders you explicitly opened on this device.</p></div>
        {orders === null ? <div className="orders-loading tracking-loading" role="status"><AppLoader active delay={0} label="Loading your orders" /><span>Loading your orders…</span></div> : orders.length === 0 ? (
          <section className="orders-empty">
            <span><ReceiptText aria-hidden="true" /></span>
            <h2>No orders yet</h2>
            <p>Once you place an order, its genuine details and current status will appear here.</p>
            <Link className="button-link" href="/#menu" onClick={(event) => { event.preventDefault(); navigateHome("menu") }}><Pizza aria-hidden="true" /> Browse menu</Link>
          </section>
        ) : (
          <div className="orders-list">
            {orders.map((order) => (
              <article className="order-card" key={order.id}>
                <div className="order-card__heading">
                  <div><small>ORDER</small><h2>{order.id}</h2></div>
                  <span className={`status-pill status-pill--${order.status}`}><i aria-hidden="true" /> {order.status.replaceAll("-"," ")}</span>
                </div>
                <p className="order-card__date"><Clock3 aria-hidden="true" /> {order.tokenNumber ? `Token ${String(order.tokenNumber).padStart(3,"0")} · ` : ""}{formatOrderDate(order.createdAt)} · {order.serviceMode === "delivery" ? "Delivery" : "Pickup"}</p>
                <p className="order-card__items">{order.items.map((item) => `${item.quantity}× ${item.name}`).join(" · ")}</p>
                <div className="order-card__footer"><span><strong>{formatRupees(order.total)}</strong><small className={order.paymentStatus==="PAID"?"order-payment is-paid":"order-payment"}>{order.paymentStatus==="PAID"?"PAID":"PAYMENT PENDING"}</small></span><Link href={`/orders/${encodeURIComponent(order.id)}`}>View order</Link></div>
              </article>
            ))}
          </div>
        )}
      </main>
      <MobileBottomNav />
    </div>
  )
}
