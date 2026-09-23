type CommerceSkeletonProps = {
  label: string
  compact?: boolean
}

export function CommerceSkeleton({ label, compact = false }: CommerceSkeletonProps) {
  return <div className={`commerce-skeleton${compact ? " is-compact" : ""}`} role="status" aria-live="polite" aria-label={label}>
    <span className="sr-only">{label}</span>
    <header className="commerce-skeleton__header">
      <i className="skeleton-shimmer" />
      <i className="skeleton-shimmer" />
      <div><i className="skeleton-shimmer" /><i className="skeleton-shimmer" /><i className="skeleton-shimmer" /></div>
    </header>
    <main className="commerce-skeleton__main">
      <div className="commerce-skeleton__title"><i className="skeleton-shimmer" /><span className="skeleton-shimmer" /></div>
      <div className="commerce-skeleton__layout">
        <section>
          {Array.from({ length: compact ? 2 : 4 }, (_, index) => <article key={index}>
            <i className="skeleton-shimmer" />
            <div><b className="skeleton-shimmer" /><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /></div>
          </article>)}
        </section>
        {!compact && <aside><i className="skeleton-shimmer" /><span className="skeleton-shimmer" /><span className="skeleton-shimmer" /><b className="skeleton-shimmer" /></aside>}
      </div>
    </main>
  </div>
}
