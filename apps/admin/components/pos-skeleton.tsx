export function PosSkeleton() {
  return (
    <section
      className="pos-page pos-bootstrap"
      role="status"
      aria-label="Loading point of sale"
    >
      <div className="pos-bootstrap__heading">
        <span />
        <span />
      </div>
      <div className="pos-layout" aria-hidden="true">
        <div className="pos-catalog">
          <div className="pos-bootstrap__search" />
          <div className="pos-categories">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} />
            ))}
          </div>
          <div className="pos-products">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div className="pos-bootstrap__tile" key={i}>
                <span />
                <span />
                <span />
              </div>
            ))}
          </div>
        </div>
        <div className="pos-cart pos-bootstrap__cart">
          <span />
          <div />
          {[0, 1, 2].map((i) => (
            <span key={i} />
          ))}
          <div />
          <span />
        </div>
      </div>
    </section>
  );
}
