import { Link, useSearchParams } from "react-router-dom";
import type { Product } from "@smartshop/shared";
import {
  CATEGORIES,
  categoryPath,
  dailyEssentials,
  dealProducts,
  featuredPicks,
  firstProductInCategory,
  formatCategoryLabel,
  heroProduct,
} from "../catalog";
import { formatCents } from "../money";
import { ProductCard } from "../ProductCard";
import { useCatalogProducts } from "../useCatalogProducts";

function ProductRail({
  title,
  to,
  products,
}: {
  title: string;
  to?: string;
  products: Product[];
}) {
  if (products.length === 0) {
    return null;
  }
  return (
    <section className="rail-section">
      <header className="section-head">
        <h2>{title}</h2>
        {to ? <Link to={to}>View all</Link> : null}
      </header>
      <ul className="rail">
        {products.map((product) => (
          <li key={product.productId}>
            <ProductCard product={product} compact />
          </li>
        ))}
      </ul>
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
          <ul className="grid">
            {products.map((product) => (
              <li key={product.productId}>
                <ProductCard product={product} />
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  const featured = heroProduct(products);
  const deals = dealProducts(products);
  const picks = featuredPicks(products);
  const essentials = dailyEssentials(products);

  return (
    <div className="marketplace">
      {featured ? (
        <Link className="hero-banner" to={`/products/${featured.productId}`}>
          <div>
            <p className="eyebrow">Featured deal on {formatCategoryLabel(featured.category)}</p>
            <h1>{featured.name}.</h1>
            <p className="lede">{featured.description}</p>
            <p className="hero-price">{formatCents(featured.unitPriceCents)}</p>
            <span className="hero-cta">Shop this deal</span>
          </div>
          <img src={featured.imageUrl} alt="" />
        </Link>
      ) : null}

      <section className="rail-section">
        <header className="section-head">
          <h2>Shop from top categories</h2>
        </header>
        <ul className="circles">
          {CATEGORIES.map((category) => {
            const sample = firstProductInCategory(products, category.slug);
            return (
              <li key={category.slug}>
                <Link className="circle-link" to={categoryPath(category.slug)}>
                  <span className="circle">
                    {sample ? <img src={sample.imageUrl} alt="" /> : category.label.slice(0, 1)}
                  </span>
                  <strong>{category.label}</strong>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <ProductRail title="Today’s deals" products={deals} />

      <section className="rail-section">
        <header className="section-head">
          <h2>Featured picks</h2>
          <Link to={categoryPath("electronics")}>View all</Link>
        </header>
        <ul className="circles">
          {picks.map((product) => (
            <li key={product.productId}>
              <Link className="circle-link" to={`/products/${product.productId}`}>
                <span className="circle">
                  <img src={product.imageUrl} alt="" />
                </span>
                <strong>{product.name}</strong>
                <span className="muted">{formatCents(product.unitPriceCents)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <ProductRail title="Daily essentials" to={categoryPath("home")} products={essentials} />
    </div>
  );
}
