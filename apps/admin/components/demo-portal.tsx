"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BarChart3, ChefHat, ClipboardList, LayoutDashboard, MapPin, Monitor, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { BookDemoModal } from "@/components/book-demo-modal";

type Page = "Dashboard" | "Orders" | "POS" | "Kitchen" | "Menu" | "Branches" | "Reports";
type DemoOrder = { id: number; branch: string; items: string; total: number; status: "PENDING" | "CONFIRMED" | "PREPARING" | "READY" };
const tabs: Array<{ label: Page; icon: typeof LayoutDashboard }> = [
  { label: "Dashboard", icon: LayoutDashboard }, { label: "Orders", icon: ClipboardList },
  { label: "POS", icon: Monitor }, { label: "Kitchen", icon: ChefHat },
  { label: "Menu", icon: UtensilsCrossed }, { label: "Branches", icon: MapPin },
  { label: "Reports", icon: BarChart3 },
];
const products = [{ name: "Margherita Pizza", price: 1490 }, { name: "Classic Burger", price: 890 }, { name: "Fresh Lemonade", price: 390 }];
const initialOrders: DemoOrder[] = [
  { id: 101, branch: "Main Outlet", items: "Margherita Pizza × 2", total: 2980, status: "PREPARING" },
  { id: 102, branch: "Riverside", items: "Classic Burger × 1", total: 890, status: "CONFIRMED" },
  { id: 103, branch: "Main Outlet", items: "Fresh Lemonade × 2", total: 780, status: "READY" },
];
const money = (value: number) => `Rs ${value.toLocaleString("en-PK")}`;

export function DemoPortal() {
  const [page, setPage] = useState<Page>("Dashboard");
  const [branch, setBranch] = useState("All outlets");
  const [orders, setOrders] = useState(initialOrders);
  const [cart, setCart] = useState<Array<{ name: string; price: number; quantity: number }>>([]);
  const filtered = useMemo(() => branch === "All outlets" ? orders : orders.filter(order => order.branch === branch), [branch, orders]);
  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const revenue = filtered.reduce((sum, order) => sum + order.total, 0);
  const counts = [filtered.length, revenue, filtered.filter(order => order.status !== "READY").length];
  function addToCart(product: typeof products[number]) {
    setCart(current => current.some(item => item.name === product.name)
      ? current.map(item => item.name === product.name ? { ...item, quantity: item.quantity + 1 } : item)
      : [...current, { ...product, quantity: 1 }]);
  }
  function placePreviewOrder() {
    if (!cart.length) return;
    setOrders(current => [{ id: Math.max(...current.map(order => order.id)) + 1, branch: branch === "All outlets" ? "Main Outlet" : branch, items: cart.map(item => `${item.name} × ${item.quantity}`).join(", "), total: cartTotal, status: "PENDING" }, ...current]);
    setCart([]); setPage("Orders");
  }
  function advance(id: number) {
    const next: Record<DemoOrder["status"], DemoOrder["status"]> = { PENDING: "CONFIRMED", CONFIRMED: "PREPARING", PREPARING: "READY", READY: "READY" };
    setOrders(current => current.map(order => order.id === id ? { ...order, status: next[order.status] } : order));
  }
  return <main className="demo-portal">
    <aside className="demo-portal__sidebar"><Link href="/login" className="demo-portal__brand"><ShoppingBag aria-hidden="true"/><span><strong>QaziPro Demo</strong><small>Sample restaurant</small></span></Link><nav aria-label="Demo pages">{tabs.map(item => { const Icon = item.icon; return <button key={item.label} type="button" aria-current={page === item.label ? "page" : undefined} onClick={() => setPage(item.label)}><Icon aria-hidden="true"/>{item.label}</button>; })}</nav><p>All data here is sample data. Changes reset when you reload.</p></aside>
    <div className="demo-portal__main"><header><div><span className="demo-portal__badge">ISOLATED PREVIEW</span><strong>{page}</strong></div><div><select aria-label="Demo outlet" value={branch} onChange={event => setBranch(event.target.value)}><option>All outlets</option><option>Main Outlet</option><option>Riverside</option></select><Link href="/login">Staff sign in</Link><BookDemoModal triggerClassName="demo-portal__book" /></div></header><section className="demo-portal__content">
      {page === "Dashboard" && <><div className="page-heading"><div><h1>Today at a glance</h1><p>Preview numbers update when you create a sample POS order.</p></div></div><div className="demo-portal__metrics"><article><span>Sample orders</span><strong>{counts[0]}</strong></article><article><span>Sample sales</span><strong>{money(counts[1])}</strong></article><article><span>Active work</span><strong>{counts[2]}</strong></article></div><h2>Recent orders</h2><DemoOrderList rows={filtered} onAdvance={advance}/></>}
      {page === "Orders" && <><div className="page-heading"><div><h1>Orders</h1><p>Review sample orders and move through legal preparation stages.</p></div></div><DemoOrderList rows={filtered} onAdvance={advance}/></>}
      {page === "Kitchen" && <><div className="page-heading"><div><h1>Kitchen board</h1><p>Only active sample tickets appear here.</p></div></div><div className="demo-portal__kitchen">{(["PENDING", "CONFIRMED", "PREPARING", "READY"] as const).map(status => <section key={status}><h2>{status.toLowerCase()}</h2>{filtered.filter(order => order.status === status).map(order => <article key={order.id}><strong>#{order.id}</strong><p>{order.items}</p>{status !== "READY" && <button type="button" onClick={() => advance(order.id)}>Move forward</button>}</article>)}</section>)}</div></>}
      {page === "POS" && <><div className="page-heading"><div><h1>Walk-in POS</h1><p>Try a sample counter order. No real payment or stock is affected.</p></div></div><div className="demo-portal__pos"><div className="demo-portal__products">{products.map(product => <button key={product.name} type="button" onClick={() => addToCart(product)}><strong>{product.name}</strong><span>{money(product.price)}</span><small>Add to cart</small></button>)}</div><aside><h2>Sample cart</h2>{cart.length ? cart.map(item => <p key={item.name}>{item.name} × {item.quantity}<strong>{money(item.price * item.quantity)}</strong></p>) : <p>Choose an item to start.</p>}<div className="demo-portal__total">Total <strong>{money(cartTotal)}</strong></div><button type="button" disabled={!cart.length} onClick={placePreviewOrder}>Create sample order</button></aside></div></>}
      {page === "Menu" && <><div className="page-heading"><div><h1>Menu catalog</h1><p>Sample items only. The live portal uses each restaurant’s actual catalog.</p></div></div><div className="demo-portal__products">{products.map(product => <article key={product.name}><strong>{product.name}</strong><span>{money(product.price)}</span><small>Available in preview</small></article>)}</div></>}
      {page === "Branches" && <><div className="page-heading"><div><h1>Branches</h1><p>Switch the sample outlet in the top bar to filter operational views.</p></div></div><div className="demo-portal__products">{["Main Outlet", "Riverside"].map(name => <article key={name}><strong>{name}</strong><span>Ordering enabled</span><small>Sample outlet</small></article>)}</div></>}
      {page === "Reports" && <><div className="page-heading"><div><h1>Reports</h1><p>Derived from the sample orders in this preview session.</p></div></div><div className="demo-portal__metrics"><article><span>Orders</span><strong>{filtered.length}</strong></article><article><span>Sales</span><strong>{money(revenue)}</strong></article><article><span>Average ticket</span><strong>{money(filtered.length ? Math.round(revenue / filtered.length) : 0)}</strong></article></div><DemoOrderList rows={filtered} onAdvance={advance}/></>}
    </section></div>
  </main>;
}

function DemoOrderList({ rows, onAdvance }: { rows: DemoOrder[]; onAdvance: (id: number) => void }) {
  return rows.length ? <div className="demo-portal__orders">{rows.map(order => <article key={order.id}><div><strong>#{order.id}</strong><small>{order.branch}</small></div><p>{order.items}</p><strong>{money(order.total)}</strong><span>{order.status}</span>{order.status !== "READY" && <button type="button" onClick={() => onAdvance(order.id)}>Next stage</button>}</article>)}</div> : <div className="state-box">No sample orders for this outlet.</div>;
}
