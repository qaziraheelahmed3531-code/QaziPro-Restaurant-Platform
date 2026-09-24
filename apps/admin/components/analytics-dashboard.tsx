"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowDownRight, ArrowUpRight, Download, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { formatPkr } from "@italian-pizza/shared";
import { ReportDetails } from "@/components/report-details";
import { createClient } from "@/lib/supabase/client";

type Point = { bucket: string; value: number; orders: number };
type Slice = {
  label: string;
  value: number;
  orders?: number;
  transactions?: number;
};
type Product = {
  label: string;
  quantity: number;
  gross_sales: number;
  net_sales: number;
};
type PosSectionSale = {
  label: string;
  quantity: number;
  value: number;
  net_sales: number;
  orders: number;
};
type Report = {
  statuses?: Array<{ label: string; count: number }>;
  summary: {
    grossSales: number;
    discounts: number;
    deliveryFees: number;
    tax: number;
    refunds: number;
    netSales: number;
    orderCount: number;
    averageOrder: number;
  };
  trend: Point[];
  channels: Slice[];
  payments: Slice[];
  topProducts: Product[];
  topCategories: Slice[];
  posSections: PosSectionSale[];
  peakHours: Array<{ hour: number; value: number; orders: number }>;
  customers: { new: number; returning: number };
  inventory: {
    stockValue: number;
    lowStock: number;
    activeIngredients: number;
  };
  shifts: { count: number; difference: number };
};
type Preset =
  | "today"
  | "yesterday"
  | "7d"
  | "30d"
  | "month"
  | "lastMonth"
  | "year"
  | "custom";
const empty: Report = {
  summary: {
    grossSales: 0,
    discounts: 0,
    deliveryFees: 0,
    tax: 0,
    refunds: 0,
    netSales: 0,
    orderCount: 0,
    averageOrder: 0,
  },
  trend: [],
  channels: [],
  payments: [],
  topProducts: [],
  topCategories: [],
  posSections: [],
  peakHours: [],
  customers: { new: 0, returning: 0 },
  inventory: { stockValue: 0, lowStock: 0, activeIngredients: 0 },
  shifts: { count: 0, difference: 0 },
};
function rangeFor(preset: Preset) {
  const now = new Date();
  const local = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const [year, month] = local.split("-").map(Number);
  let start = new Date(`${local}T00:00:00+05:00`);
  let end = new Date(start.getTime() + 86400000);
  if (preset === "yesterday") {
    end = start;
    start = new Date(start.getTime() - 86400000);
  } else if (preset === "7d" || preset === "30d")
    start = new Date(
      start.getTime() - ((preset === "7d" ? 7 : 30) - 1) * 86400000,
    );
  else if (preset === "month")
    start = new Date(
      `${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:00`,
    );
  else if (preset === "lastMonth") {
    end = new Date(
      `${year}-${String(month).padStart(2, "0")}-01T00:00:00+05:00`,
    );
    start = new Date(
      `${month === 1 ? year - 1 : year}-${String(month === 1 ? 12 : month - 1).padStart(2, "0")}-01T00:00:00+05:00`,
    );
  } else if (preset === "year")
    start = new Date(`${year}-01-01T00:00:00+05:00`);
  return { start: start.toISOString(), end: end.toISOString() };
}
function previousRange(range: { start: string; end: string }) {
  const duration =
    new Date(range.end).getTime() - new Date(range.start).getTime();
  return {
    start: new Date(new Date(range.start).getTime() - duration).toISOString(),
    end: range.start,
  };
}
function percent(current: number, previous: number) {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 100);
}
function Trend({ points }: { points: Point[] }) {
  const width = 720,
    height = 190,
    max = Math.max(...points.map((point) => Number(point.value)), 1);
  const coordinates = points
    .map(
      (point, index) =>
        `${points.length === 1 ? width / 2 : (index / (points.length - 1)) * width},${height - (Number(point.value) / max) * (height - 24) - 12}`,
    )
    .join(" ");
  return (
    <div
      className="trend-chart"
      role="img"
      aria-label={
        points.length
          ? `Sales trend with ${points.length} points. Peak ${formatPkr(max)}.`
          : "No sales trend data."
      }
    >
      {points.length ? (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <defs>
            <linearGradient id="sales-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="var(--brand)" stopOpacity=".2" />
              <stop offset="1" stopColor="var(--brand)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon
            points={`0,${height} ${coordinates} ${width},${height}`}
            fill="url(#sales-fill)"
          />
          <polyline
            points={coordinates}
            fill="none"
            stroke="var(--brand)"
            strokeWidth="3"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <div className="empty-panel">No order sales in this range.</div>
      )}
      <div className="trend-labels">
        {points.slice(0, 8).map((point) => (
          <span key={point.bucket}>
            {new Date(point.bucket).toLocaleDateString("en-PK", {
              timeZone: "Asia/Karachi",
              month: "short",
              day: "numeric",
              hour: points.length < 25 ? "numeric" : undefined,
            })}
          </span>
        ))}
      </div>
    </div>
  );
}
function Breakdown({ rows }: { rows: Slice[] }) {
  const palette = [
    "var(--brand)",
    "#3275b9",
    "#278361",
    "#9a64b1",
    "#b87824",
    "#64828e",
  ];
  const total = rows.reduce(
    (sum, row) => sum + Math.max(0, Number(row.value)),
    0,
  );
  return (
    <div className="report-breakdown">
      {total > 0 && (
        <div
          className="report-donut"
          role="img"
          aria-label={rows
            .map(
              (row) =>
                `${row.label.replaceAll("_", " ")}: ${formatPkr(Number(row.value))}, ${Math.round((Math.max(0, Number(row.value)) / total) * 100)} percent`,
            )
            .join(". ")}
        >
          <svg viewBox="0 0 120 120" aria-hidden="true">
            <circle
              cx="60"
              cy="60"
              r="46"
              fill="none"
              stroke="var(--line)"
              strokeWidth="14"
            />
            {rows.map((row, index) => {
              const share = (Math.max(0, Number(row.value)) / total) * 100;
              const start = rows
                .slice(0, index)
                .reduce(
                  (sum, prior) =>
                    sum + (Math.max(0, Number(prior.value)) / total) * 100,
                  0,
                );
              return (
                <circle
                  key={row.label}
                  cx="60"
                  cy="60"
                  r="46"
                  pathLength="100"
                  fill="none"
                  stroke={palette[index % palette.length]}
                  strokeWidth="14"
                  strokeDasharray={`${share} ${100 - share}`}
                  strokeDashoffset={-start}
                  transform="rotate(-90 60 60)"
                />
              );
            })}
          </svg>
          <span>
            <small>Total sales</small>
            <strong>{formatPkr(total)}</strong>
          </span>
        </div>
      )}
      <div className="report-chart-legend">
        {rows.length ? (
          rows.map((row, index) => (
            <div key={row.label}>
              <i style={{ background: palette[index % palette.length] }} />
              <span>
                <strong>{row.label.replaceAll("_", " ")}</strong>
                <small>
                  {row.orders ?? row.transactions ?? 0}{" "}
                  {row.transactions !== undefined ? "transactions" : "orders"}
                </small>
              </span>
              <b>
                {formatPkr(Number(row.value))}
                <small>
                  {total
                    ? Math.round((Math.max(0, Number(row.value)) / total) * 100)
                    : 0}
                  %
                </small>
              </b>
            </div>
          ))
        ) : (
          <div className="empty-panel compact">No sales in this period.</div>
        )}
      </div>
    </div>
  );
}
export function AnalyticsDashboard({
  businessId,
  branchId,
  initialReport,
  initialPrevious,
  initialRange,
}: {
  businessId: string;
  branchId: string | null;
  initialReport: unknown;
  initialPrevious: unknown;
  initialRange: { start: string; end: string };
}) {
  const [report, setReport] = useState<Report>(
    (initialReport as Report) ?? empty,
  );
  const [previous, setPrevious] = useState<Report>(
    (initialPrevious as Report) ?? empty,
  );
  const [preset, setPreset] = useState<Preset>("today");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [customRange, setCustomRange] = useState(initialRange);
  const currentRange = useMemo(
    () =>
      preset === "custom"
        ? customRange
        : preset === "today"
          ? initialRange
          : rangeFor(preset),
    [initialRange, preset, customRange],
  );
  const load = async (
    next: Preset,
    override?: { start: string; end: string },
  ) => {
    setPreset(next);
    setLoading(true);
    setError("");
    const range =
      override ?? (next === "today" ? initialRange : rangeFor(next));
    const prior = previousRange(range);
    const supabase = createClient();
    const [currentResult, previousResult] = await Promise.all([
      supabase.rpc("restaurant_report", {
        p_business_id: businessId,
        p_start: range.start,
        p_end: range.end,
        p_branch_id: branchId,
      }),
      supabase.rpc("restaurant_report", {
        p_business_id: businessId,
        p_start: prior.start,
        p_end: prior.end,
        p_branch_id: branchId,
      }),
    ]);
    if (currentResult.error || previousResult.error)
      setError(
        currentResult.error?.message ??
          previousResult.error?.message ??
          "Report unavailable",
      );
    if (currentResult.data) setReport(currentResult.data as Report);
    if (previousResult.data) setPrevious(previousResult.data as Report);
    setLoading(false);
  };
  const comparison = percent(
    report.summary.netSales,
    previous.summary.netSales,
  );
  const exportCsv = () => {
    const lines: [[string, string | number], ...[string, string | number][]] = [
      ["Metric", "Value"],
      ["Gross sales", report.summary.grossSales],
      ["Discounts", report.summary.discounts],
      ["Refunds", report.summary.refunds],
      ["Net sales", report.summary.netSales],
      ["Orders", report.summary.orderCount],
      ["Average order", report.summary.averageOrder],
      ...report.topProducts.map(
        (row) => [`Product: ${row.label}`, row.net_sales] as [string, number],
      ),
      ...(report.posSections ?? []).map(
        (row) =>
          [`POS section: ${row.label}`, row.net_sales] as [string, number],
      ),
    ];
    const blob = new Blob(
      [
        lines
          .map((row) =>
            row
              .map((value) => `"${String(value).replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\n"),
      ],
      { type: "text/csv" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `italian-pizza-${preset}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  return (
    <div className="report-print-root">
      <div className="page-heading">
        <div>
          <span className="eyebrow">EXECUTIVE OVERVIEW</span>
          <h1>Restaurant performance</h1>
          <p>
            Track sales, payments, orders and stock for the selected period.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="button button--outline no-print"
            onClick={() => {
              document.documentElement.dataset.printKind = "report";
              window.print();
            }}
          >
            Print report
          </button>
          <button className="button button--outline" onClick={exportCsv}>
            <Download />
            Export CSV
          </button>
          <Link className="button" href="/pos">
            <Plus />
            New counter order
          </Link>
        </div>
      </div>
      <div className="range-tabs" aria-label="Report date range">
        {(
          [
            "today",
            "yesterday",
            "7d",
            "30d",
            "month",
            "lastMonth",
            "year",
          ] as Preset[]
        ).map((value) => (
          <button
            key={value}
            className={preset === value ? "is-active" : ""}
            disabled={loading}
            onClick={() => void load(value)}
          >
            {
              {
                today: "Today",
                yesterday: "Yesterday",
                "7d": "7 Days",
                "30d": "30 Days",
                month: "This Month",
                lastMonth: "Last Month",
                year: "This Year",
                custom: "Custom",
              }[value]
            }
          </button>
        ))}
      </div>
      <form
        className="resource-toolbar no-print"
        onSubmit={(event) => {
          event.preventDefault();
          const range = {
            start: new Date(customStart + "T00:00:00+05:00").toISOString(),
            end: new Date(
              new Date(customEnd + "T00:00:00+05:00").getTime() + 86400000,
            ).toISOString(),
          };
          setCustomRange(range);
          void load("custom", range);
        }}
      >
        <label>
          From{" "}
          <input
            aria-label="Report start date"
            type="date"
            required
            value={customStart}
            onChange={(event) => setCustomStart(event.target.value)}
          />
        </label>
        <label>
          To{" "}
          <input
            aria-label="Report end date"
            type="date"
            required
            min={customStart}
            value={customEnd}
            onChange={(event) => setCustomEnd(event.target.value)}
          />
        </label>
        <button className="button button--outline" disabled={loading}>
          Apply custom range
        </button>
      </form>
      {error && (
        <p className="inline-notice is-error" role="alert">
          {error}
        </p>
      )}
      <section className="metric-grid metric-grid--six" aria-busy={loading}>
        {[
          ["Net sales", formatPkr(report.summary.netSales), comparison],
          [
            "Orders",
            String(report.summary.orderCount),
            percent(report.summary.orderCount, previous.summary.orderCount),
          ],
          [
            "Average order",
            formatPkr(report.summary.averageOrder),
            percent(report.summary.averageOrder, previous.summary.averageOrder),
          ],
          [
            "Pending orders",
            String(
              (report.statuses ?? [])
                .filter(
                  (row) => !["DELIVERED", "CANCELLED"].includes(row.label),
                )
                .reduce((sum, row) => sum + row.count, 0),
            ),
            null,
          ],
          [
            "Website sales",
            formatPkr(
              report.channels
                .filter((row) => row.label.startsWith("WEBSITE"))
                .reduce((sum, row) => sum + Number(row.value), 0),
            ),
            null,
          ],
          [
            "Counter sales",
            formatPkr(
              report.channels
                .filter((row) => row.label === "POS")
                .reduce((sum, row) => sum + Number(row.value), 0),
            ),
            null,
          ],
        ].map(([label, value, delta]) => (
          <article className="metric-card" key={String(label)}>
            <span>{label}</span>
            <motion.strong
              key={String(value)}
              initial={{ opacity: 0.4, y: 3 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {value}
            </motion.strong>
            <small>
              {typeof delta === "number" ? (
                <>
                  <i className={delta >= 0 ? "positive" : "negative"}>
                    {delta >= 0 ? <ArrowUpRight /> : <ArrowDownRight />}
                    {Math.abs(delta)}%
                  </i>{" "}
                  vs previous period
                </>
              ) : (
                "Selected period"
              )}
            </small>
          </article>
        ))}
      </section>
      <div className="analytics-grid">
        <section className="panel analytics-main">
          <div className="panel-header">
            <div>
              <h2>Sales trend</h2>
              <p>
                {new Date(currentRange.start).toLocaleDateString("en-PK", {
                  timeZone: "Asia/Karachi",
                })} –{" "}
                {new Date(currentRange.end).toLocaleDateString("en-PK", {
                  timeZone: "Asia/Karachi",
                })}
              </p>
            </div>
          </div>
          <Trend points={report.trend ?? []} />
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Order channels</h2>
          </div>
          <Breakdown rows={report.channels ?? []} />
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Payment mix</h2>
          </div>
          <Breakdown rows={report.payments ?? []} />
        </section>
        <section className="panel analytics-main">
          <div className="panel-header">
            <div>
              <h2>POS section sales</h2>
              <p>
                Counter revenue is grouped by the section saved with each sold
                item.
              </p>
            </div>
          </div>
          {report.posSections?.length ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Orders</th>
                    <th>Items</th>
                    <th>Gross</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {report.posSections.map((row) => (
                    <tr key={row.label}>
                      <td data-label="Section">{row.label}</td>
                      <td data-label="Orders">{row.orders}</td>
                      <td data-label="Items">{row.quantity}</td>
                      <td data-label="Gross">{formatPkr(row.value)}</td>
                      <td data-label="Net">{formatPkr(row.net_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-panel compact">
              POS section sales appear after the first counter order.
            </div>
          )}
        </section>
        <section className="panel analytics-main">
          <div className="panel-header">
            <h2>Top products</h2>
            <Link href="/reports">Full report</Link>
          </div>
          {report.topProducts?.length ? (
            <div className="data-table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Qty</th>
                    <th>Gross</th>
                    <th>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {report.topProducts.slice(0, 5).map((row) => (
                    <tr key={row.label}>
                      <td data-label="Product">{row.label}</td>
                      <td data-label="Qty">{row.quantity}</td>
                      <td data-label="Gross">{formatPkr(row.gross_sales)}</td>
                      <td data-label="Net">{formatPkr(row.net_sales)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-panel compact">
              Products appear here after your first sale.
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <h2>Peak hours</h2>
          </div>
          <div className="peak-grid">
            {[...(report.peakHours ?? [])]
              .sort((a, b) => b.value - a.value)
              .slice(0, 6)
              .map((row) => (
                <div key={row.hour}>
                  <strong>
                    {row.hour % 12 || 12} {row.hour < 12 ? "AM" : "PM"}
                  </strong>
                  <span>{row.orders} orders</span>
                  <b>{formatPkr(row.value)}</b>
                </div>
              ))}
            {!report.peakHours?.length && (
              <div className="empty-panel compact">No hourly data yet.</div>
            )}
          </div>
        </section>
      </div>
      <ReportDetails report={report} />
    </div>
  );
}
