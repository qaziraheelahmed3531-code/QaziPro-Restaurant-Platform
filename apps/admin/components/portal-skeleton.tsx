export function PortalSkeleton({ variant = "page" }: { variant?: "page" | "dashboard" | "table" }) {
  return <div className={`portal-skeleton portal-skeleton--${variant}`} role="status" aria-label="Loading page">
    <div className="portal-skeleton__heading"><span /><span /></div>
    {variant === "dashboard" && <div className="portal-skeleton__metrics">{[0, 1, 2, 3].map(item => <span key={item} />)}</div>}
    <div className="portal-skeleton__content"><span /><span /></div>
    <div className="portal-skeleton__rows">{[0, 1, 2, 3, 4].map(item => <span key={item} />)}</div>
  </div>;
}
