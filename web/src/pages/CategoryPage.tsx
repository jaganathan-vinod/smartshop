import { Link, useParams } from "react-router-dom";
import { CATEGORIES, formatCategoryLabel } from "../catalog";
import { ProductCard } from "../ProductCard";
import { useCatalogProducts } from "../useCatalogProducts";

export function CategoryPage() {
  const { category = "" } = useParams();
  const { products, error } = useCatalogProducts({ category });
  const label = formatCategoryLabel(category);
  const known = CATEGORIES.find((item) => item.slug === category);

  return (
    <section className="category-page">
      <p className="crumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true"> / </span>
        <span>{label}</span>
      </p>
      <header className="section-head">
        <div>
          <h1>{label}</h1>
          <p className="lede">
            {known?.blurb ?? "Products in this category, loaded from the catalogue."}
          </p>
        </div>
      </header>
      {error && <p className="flash error">{error}</p>}
      {products === null && !error ? <p className="muted">Loading {label.toLowerCase()}…</p> : null}
      {products && products.length === 0 ? (
        <p className="muted">No products in this category yet.</p>
      ) : null}
      {products && products.length > 0 ? (
        <ul className="grid">
          {products.map((product) => (
            <li key={product.productId}>
              <ProductCard product={product} variant="deal" />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
