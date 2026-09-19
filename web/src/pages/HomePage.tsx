import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { Product } from "@smartshop/shared";
import { listProducts } from "../api";
import { formatCents } from "../money";

export function HomePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const q = params.get("q") ?? "";
  const [products, setProducts] = useState<Product[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    listProducts(q || undefined)
      .then((result) => {
        if (!cancelled) {
          setProducts(result.products);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load products");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [q]);

  return (
    <section>
      <div className="hero">
        <h1>Find something useful.</h1>
        <p className="lede">
          Browse the seeded catalogue, then sign in to cart, preview delivery, and
          confirm an order.
        </p>
        <form
          className="search"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            event.preventDefault();
            const value = String(new FormData(event.currentTarget).get("q") ?? "").trim();
            navigate(value ? `/?q=${encodeURIComponent(value)}` : "/");
          }}
        >
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Search by name"
            aria-label="Search products"
          />
          <button type="submit">Search</button>
        </form>
      </div>
      {error && <p className="flash error">{error}</p>}
      {products === null && !error ? <p className="muted">Loading catalogue…</p> : null}
      {products && products.length === 0 ? (
        <p className="muted">No products match that search.</p>
      ) : null}
      {products && products.length > 0 ? (
        <ul className="grid">
          {products.map((product) => (
            <li key={product.productId}>
              <Link className="card" to={`/products/${product.productId}`}>
                <img src={product.imageUrl} alt="" />
                <h2>{product.name}</h2>
                <p className="price">{formatCents(product.unitPriceCents)}</p>
                <p className="muted">{product.category}</p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
