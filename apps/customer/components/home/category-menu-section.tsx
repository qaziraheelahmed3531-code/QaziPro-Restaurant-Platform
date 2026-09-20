import { DealCard } from "@/components/product/deal-card"
import { ProductCard } from "@/components/product/product-card"
import type { Deal, MenuSection, Product } from "@/types"
import { Reveal } from "@/components/ui/reveal"

export function CategoryMenuSection({ section, products, deals }: { section: MenuSection; products: Product[]; deals: Deal[] }) {
  const sectionProducts = section.productCategory
    ? products.filter((product) => product.category === section.productCategory)
    : []

  return (
    <section className="category-menu-section" id={section.id} aria-labelledby={`${section.id}-title`}>
      {section.bannerImage && <div className="category-banner">
        {/* Dynamic uploads can use different ratios; intrinsic sizing preserves every pixel without letterboxing. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={section.bannerImage} loading="lazy" decoding="async" alt={`${section.title} category banner`} />
      </div>}
      <Reveal className="menu-section-heading">
        <div>
          <h2 id={`${section.id}-title`}>{section.title}</h2>
          {section.description && <p className={section.descriptionBold ? "is-bold" : undefined}>{section.description}</p>}
        </div>
        <span>{section.kind === "deals" ? `${deals.length} offers` : sectionProducts.length ? `${sectionProducts.length} items` : "Coming soon"}</span>
      </Reveal>
      {section.kind === "deals" ? (
        <div className="deal-rail">{deals.map((deal) => <DealCard key={deal.id} deal={deal} />)}</div>
      ) : sectionProducts.length > 0 ? (
        <>
          <div className="product-grid desktop-product-grid">{sectionProducts.map((product) => <ProductCard key={product.id} product={product} />)}</div>
          <div className="compact-product-list">{sectionProducts.map((product) => <ProductCard key={product.id} product={product} compact />)}</div>
        </>
      ) : (
        <div className="menu-slot-empty"><span>Photography and menu items can be added here without changing this section layout.</span></div>
      )}
    </section>
  )
}
