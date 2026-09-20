export function StorefrontSkeleton({ overlay = false }: { overlay?: boolean }) {
  return <div className={`storefront-skeleton${overlay ? " is-boot-overlay" : ""}`} role="status" aria-live="polite" aria-label="Loading restaurant menu">
    <span className="sr-only">Loading restaurant menu</span>
    <div className="storefront-skeleton__announcement skeleton-shimmer" />
    <header className="storefront-skeleton__header">
      <i className="storefront-skeleton__logo skeleton-shimmer" />
      <div className="storefront-skeleton__location skeleton-shimmer"><i/><span/></div>
      <div className="storefront-skeleton__actions"><i className="skeleton-shimmer"/><i className="skeleton-shimmer"/><i className="skeleton-shimmer"/></div>
    </header>
    <nav className="storefront-skeleton__tabs" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i className="skeleton-shimmer" key={index}/>)}</nav>
    <main className="storefront-skeleton__main">
      <div className="storefront-skeleton__hero skeleton-shimmer" />
      <section className="storefront-skeleton__section">
        <div className="storefront-skeleton__heading"><i className="skeleton-shimmer"/><span className="skeleton-shimmer"/></div>
        <div className="storefront-skeleton__categories">{Array.from({ length: 5 }, (_, index) => <i className="skeleton-shimmer" key={index}/>)}</div>
        <div className="storefront-skeleton__search skeleton-shimmer" />
      </section>
      <section className="storefront-skeleton__menu">
        <div className="storefront-skeleton__banner skeleton-shimmer" />
        <div className="storefront-skeleton__heading"><i className="skeleton-shimmer"/><span className="skeleton-shimmer"/></div>
        <div className="storefront-skeleton__products">{Array.from({ length: 4 }, (_, index) => <article key={index}><i className="skeleton-shimmer"/><span className="skeleton-shimmer"/><b className="skeleton-shimmer"/></article>)}</div>
      </section>
    </main>
  </div>
}
