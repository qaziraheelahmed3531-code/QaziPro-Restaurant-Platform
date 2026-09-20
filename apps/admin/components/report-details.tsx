"use client"

import Link from "next/link"
import { formatPkr } from "@italian-pizza/shared"

type Details = {
  statuses?: Array<{label:string;count:number}>
  topCategories?: Array<{label:string;value:number}>
  customers: {new:number;returning:number}
  inventory: {stockValue:number;lowStock:number;activeIngredients:number}
  shifts: {count:number;difference:number}
  summary: {deliveryFees:number;tax:number;grossSales:number;discounts:number;refunds:number}
}

export function ReportDetails({report}:{report:Details}) {
  return <div className="analytics-grid section-gap">
    <section className="panel"><div className="panel-header"><h2>Sales breakdown</h2></div><div className="report-coverage"><span>Gross sales {formatPkr(report.summary.grossSales)}</span><span>Discounts {formatPkr(report.summary.discounts)}</span><span>Successful refunds {formatPkr(report.summary.refunds)}</span></div></section>
    <section className="panel"><div className="panel-header"><h2>Order status</h2></div><div className="report-coverage">{report.statuses?.map(row=><Link key={row.label} href={`/orders?status=${row.label}`}>{row.label.replaceAll("_"," ")} · {row.count}</Link>)}{!report.statuses?.length&&<p>No orders in this period.</p>}</div></section>
    <section className="panel"><div className="panel-header"><h2>Category mix</h2></div><div className="report-coverage">{report.topCategories?.map(row=><span key={row.label}>{row.label} · {formatPkr(row.value)}</span>)}{!report.topCategories?.length&&<p>No category sales yet.</p>}</div></section>
    <section className="panel"><div className="panel-header"><h2>Customers</h2></div><div className="report-coverage"><span>{report.customers.new} first-time customers</span><span>{report.customers.returning} returning customers</span><small>Based on signed-in customer order history; guests are excluded.</small></div></section>
    <section className="panel"><div className="panel-header"><h2>Stock & shifts</h2></div><div className="report-coverage"><Link href="/inventory">Stock value {formatPkr(report.inventory.stockValue)}</Link><span>{report.inventory.lowStock} low-stock ingredients</span><Link href="/register">{report.shifts.count} shifts · variance {formatPkr(report.shifts.difference)}</Link><span>Delivery fees {formatPkr(report.summary.deliveryFees)}</span><span>Tax {formatPkr(report.summary.tax)}</span></div></section>
  </div>
}
