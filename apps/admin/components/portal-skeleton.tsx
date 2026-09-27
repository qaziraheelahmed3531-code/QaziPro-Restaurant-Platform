type SkeletonVariant = "page" | "dashboard" | "reports" | "orders" | "menu" | "tables" | "kitchen";

const labels: Record<SkeletonVariant, string> = {
  page: "Loading page", dashboard: "Loading restaurant performance", reports: "Loading reports",
  orders: "Loading orders", menu: "Loading products", tables: "Loading restaurant tables", kitchen: "Loading kitchen orders",
};

// Deterministic markup works in streaming fallbacks and client fetch states.
// Shapes are decorative: the status announces without exposing fake controls or data.
function Shape({ kind = "line", width }: { kind?: string; width?: string }) {
  return <span className={`portal-skeleton__shape portal-skeleton__shape--${kind}`} style={width ? { width } : undefined} />;
}

function Toolbar({ count = 3 }: { count?: number }) {
  return <div className="portal-skeleton__toolbar">{Array.from({ length: count }, (_, i) =>
    <Shape key={i} kind={i === 0 ? "search" : "control"} />)}</div>;
}

function PanelHeading() {
  return <div className="panel-header portal-skeleton__panel-heading"><Shape kind="subtitle" width="170px" /><Shape kind="caption" width="min(350px, 90%)" /></div>;
}

function Availability() {
  return <div className="panel portal-skeleton__surface portal-skeleton__availability"><PanelHeading />
    <div className="availability-grid">{[0, 1, 2, 3].map(i => <div className="portal-skeleton__availability-item" key={i}><Shape width="70%" /><Shape kind="badge" /></div>)}</div>
  </div>;
}

function Rows({ orders = false }: { orders?: boolean }) {
  const columns = orders ? ["Order / Token", "Customer", "Time", "Channel", "Type", "Amount", "Payment", "Status", "Action"] : ["Table", "Code", "Seats", "Status", "Actions"];
  return <div className="portal-skeleton__surface"><div className="data-table-wrap">
    <table className="data-table portal-skeleton__table">
      <thead><tr>{columns.map(label => <th key={label}><Shape width="72%" /></th>)}</tr></thead>
      <tbody>{Array.from({ length: 5 }, (_, row) => <tr key={row}>{columns.map((label, column) =>
        <td key={label} data-label={label}>
          <Shape kind={column >= columns.length - 2 ? "badge" : "line"} width={column === 0 ? "78%" : undefined} />
          {orders && column < 2 && <Shape kind="caption" width={row % 2 ? "60%" : "48%"} />}
        </td>)}</tr>)}</tbody>
    </table>
  </div></div>;
}

function Analytics() {
  return <>
    <div className="metric-grid metric-grid--six">{Array.from({ length: 6 }, (_, i) =>
      <div className="metric-card portal-skeleton__surface" key={i}>
        <Shape width="64%" /><Shape kind="value" width={i % 2 ? "48%" : "72%"} /><Shape kind="caption" width="78%" />
      </div>)}</div>
    <div className="analytics-grid">
      <div className="panel analytics-main portal-skeleton__surface portal-skeleton__chart">
        <Shape kind="subtitle" width="34%" /><Shape kind="caption" width="46%" />
        <div className="portal-skeleton__plot">{[0, 1, 2, 3].map(i => <div key={i}><Shape kind="caption" width="28px" /><i /></div>)}</div>
        <div className="portal-skeleton__axis">{[0, 1, 2, 3, 4].map(i => <Shape key={i} kind="caption" width="32px" />)}</div>
      </div>
      <div className="panel portal-skeleton__surface portal-skeleton__chart">
        <Shape kind="subtitle" width="54%" />
        <div className="portal-skeleton__breakdown">{[0, 1, 2, 3].map(i => <div key={i}><Shape width="50%" /><Shape kind="caption" width="22%" /></div>)}</div>
      </div>
    </div>
  </>;
}

function Products() {
  return <div className="product-sections">{[0, 1].map(section =>
    <div className="panel product-section portal-skeleton__surface" key={section}>
      <div className="product-section__heading"><Shape kind="subtitle" width="160px" /></div>
      <div className="product-admin-grid">{[0, 1, 2].map(item =>
        <div className="product-admin-card" key={item}>
          <Shape kind="image" />
          <div className="portal-skeleton__product-copy"><Shape kind="subtitle" width={item % 2 ? "58%" : "72%"} /><Shape kind="caption" width="40%" /><Shape width="70px" /><Shape kind="badge" /></div>
          <Shape kind="control" />
        </div>)}</div>
    </div>)}</div>;
}

function Kitchen() {
  return <div className="kds-board">{[0, 1].map(column =>
    <div className="portal-skeleton__kitchen-column" key={column}>
      <Shape kind="subtitle" width="150px" />
      {[0, 1].map(card => <div className="panel portal-skeleton__surface portal-skeleton__ticket" key={card}>
        <div className="portal-skeleton__ticket-heading"><Shape kind="value" width="88px" /><Shape kind="badge" /></div>
        <Shape kind="caption" width="65%" />
        <div className="portal-skeleton__ticket-items">{[0, 1, 2].map(i => <Shape key={i} width={i % 2 ? "55%" : "80%"} />)}</div>
        <div className="portal-skeleton__ticket-heading"><Shape kind="control" /><Shape kind="control" /></div>
      </div>)}
    </div>)}</div>;
}

export function PortalSkeleton({ variant = "page", contentOnly = false }: { variant?: SkeletonVariant; contentOnly?: boolean }) {
  const analytics = variant === "dashboard" || variant === "reports";
  return <div className={`portal-skeleton portal-skeleton--${variant}`} role="status" aria-label={labels[variant]}>
    <div aria-hidden="true">
      {!contentOnly && <>
        <div className="page-heading portal-skeleton__heading">
          <div><Shape kind="caption" width="150px" /><Shape kind="title" /><Shape kind="description" /></div>
          <Shape kind="control" />
        </div>
        {(analytics || variant === "orders") && <div className="portal-skeleton__tabs">{Array.from({ length: analytics ? 7 : 6 }, (_, i) => <Shape kind="tab" key={i} />)}</div>}
        {variant === "menu" && <Availability />}
        {(analytics || variant === "orders" || variant === "menu") && <Toolbar count={variant === "orders" ? 4 : 3} />}
      </>}
      {analytics ? <Analytics /> : variant === "menu" ? <Products /> : variant === "kitchen" ? <Kitchen /> : variant === "orders" ? <Rows orders /> : variant === "tables" ? <>
        <div className="panel portal-skeleton__surface portal-skeleton__table-create"><PanelHeading />
          <div className="form-grid portal-skeleton__table-form">{[0, 1, 2].map(i => <div key={i}><Shape kind="caption" width="80px" /><Shape kind="field" /></div>)}<Shape kind="control" /></div>
        </div>
        <div className="panel"><PanelHeading /><Rows /></div>
      </> : <div className="panel portal-skeleton__surface portal-skeleton__generic"><Shape kind="subtitle" width="35%" /><Shape width="70%" /><Shape width="50%" /><Toolbar /></div>}
    </div>
  </div>;
}
