export function PageSkeleton() {
  return <main className="page-skeleton" aria-busy="true" aria-label="Loading page">
    <p role="status" className="sr-only">Loading your workspace…</p>
    <div className="skeleton skeleton-title"/><div className="skeleton skeleton-subtitle"/>
    <div className="skeleton-grid">{[0,1,2,3].map(key => <div className="skeleton skeleton-card" key={key}/>)}</div>
    <div className="panel">{[0,1,2,3,4,5].map(key => <div className="skeleton skeleton-row" key={key}/>)}</div>
  </main>
}
