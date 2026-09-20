import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Product } from "@smartshop/shared";
import {
  CATEGORIES,
  categoryPath,
  dealProducts,
  featuredPicks,
  firstProductInCategory,
  formatCategoryLabel,
  heroHighlights,
  heroSlides,
  type HeroHighlight,
} from "../catalog";
import { formatCents } from "../money";
import { ProductCard } from "../ProductCard";
import { useCatalogProducts } from "../useCatalogProducts";

function HighlightGlyph({ icon }: { icon: HeroHighlight["icon"] }) {
  if (icon === "bolt") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path fill="currentColor" d="M13 2 4 14h7l-1 8 10-14h-7l0-6Z" />
      </svg>
    );
  }
  if (icon === "grid") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M12 2 4.5 9.2 12 22l7.5-12.8L12 2Z" />
    </svg>
  );
}

function HeroPromo({ slides }: { slides: Product[] }) {
  const [page, setPage] = useState(0);
  const featured = slides[page] ?? slides[0];
  if (!featured) {
    return null;
  }
  const last = slides.length - 1;

  return (
    <section className="hero-promo" aria-roledescription="carousel" aria-label="Featured deals">
      {slides.length > 1 ? (
        <button
          type="button"
          className="hero-nav prev"
          aria-label="Previous featured deal"
          onClick={() => setPage((current) => (current === 0 ? last : current - 1))}
        >
          ‹
        </button>
      ) : null}
      <div className="hero-copy">
        <p className="eyebrow">Featured deal on {formatCategoryLabel(featured.category)}</p>
        <h1>{featured.name}.</h1>
        <p className="lede">{featured.description}</p>
        <ul className="hero-highlights">
          {heroHighlights(featured).map((item) => (
            <li key={item.label}>
              <span className="hero-highlight-icon">
                <HighlightGlyph icon={item.icon} />
              </span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
        <p className="hero-price">{formatCents(featured.unitPriceCents)}</p>
        <div className="hero-actions">
          <Link className="hero-cta" to={`/products/${featured.productId}`}>
            Shop this deal →
          </Link>
          <Link className="hero-cta-secondary" to={`/products/${featured.productId}`}>
            Learn more
          </Link>
        </div>
      </div>
      <div className="hero-visual">
        <img src={featured.imageUrl} alt="" />
        <aside className="hero-postcard">
          Better Tools
          <br />
          Brighter Days
        </aside>
        <p className="hero-script">
          Work
          <br />
          Play
          <br />
          Create
          <br />
          Repeat
        </p>
      </div>
      {slides.length > 1 ? (
        <button
          type="button"
          className="hero-nav next"
          aria-label="Next featured deal"
          onClick={() => setPage((current) => (current === last ? 0 : current + 1))}
        >
          ›
        </button>
      ) : null}
      {slides.length > 1 ? (
        <ol className="hero-pages">
          {slides.map((slide, index) => (
            <li key={slide.productId}>
              <button
                type="button"
                aria-label={`Show featured deal ${index + 1}`}
                aria-current={index === page ? "true" : undefined}
                onClick={() => setPage(index)}
              />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

export function HomePage() {
  const [params] = useSearchParams();
  const q = params.get("q") ?? "";
  const { products, error } = useCatalogProducts(q ? { q } : {});

  if (error) {
    return <p className="flash error">{error}</p>;
  }
  if (products === null) {
    return <p className="muted">Loading catalogue…</p>;
  }

  if (q) {
    return (
      <section>
        <header className="section-head">
          <h1>Search</h1>
          <p className="lede">
            {products.length} {products.length === 1 ? "match" : "matches"} for “{q}”.
          </p>
        </header>
        {products.length === 0 ? (
          <p className="muted">No products match that search.</p>
        ) : (
          <ul className="deal-grid">
            {products.map((product) => (
              <li key={product.productId}>
                <ProductCard product={product} variant="deal" />
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const slides = heroSlides(products);
  const deals = dealProducts(products).slice(0, 4);
  const picks = featuredPicks(products).slice(0, 3);

  return (
    <div className="marketplace">
      <HeroPromo slides={slides} />

      <section className="rail-section">
        <header className="section-head">
          <h2>Shop by category</h2>
          <Link to={categoryPath("electronics")}>View all categories →</Link>
        </header>
        <ul className="cat-tiles">
          {CATEGORIES.map((category) => {
            const sample = firstProductInCategory(products, category.slug);
            return (
              <li key={category.slug}>
                <Link className="cat-tile" to={categoryPath(category.slug)}>
                  <span className="circle">
                    {sample ? <img src={sample.imageUrl} alt="" /> : category.label.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{category.label}</strong>
                    <em>{category.blurb}</em>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rail-section">
        <header className="section-head">
          <h2>Today’s deals</h2>
          <Link to="/">View all deals →</Link>
        </header>
        <ul className="deal-grid">
          {deals.map((product) => (
            <li key={product.productId}>
              <ProductCard product={product} variant="deal" />
            </li>
          ))}
        </ul>
      </section>

      <section className="rail-section">
        <header className="section-head">
          <h2>Featured picks</h2>
          <Link to={categoryPath("electronics")}>View all products →</Link>
        </header>
        <ul className="pick-grid">
          {picks.map((product) => (
            <li key={product.productId}>
              <ProductCard product={product} variant="pick" />
            </li>
          ))}
        </ul>
      </section>

      <ul className="trust">
        <li>
          <strong>Free delivery</strong>
          <span>On orders over $50</span>
        </li>
        <li>
          <strong>Secure checkout</strong>
          <span>Your data is protected</span>
        </li>
        <li>
          <strong>Easy returns</strong>
          <span>Hassle-free within 30 days</span>
        </li>
        <li>
          <strong>Customer support</strong>
          <span>Here to help</span>
        </li>
      </ul>
    </div>
  );
}
