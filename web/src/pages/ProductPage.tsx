import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { Product } from "@smartshop/shared";
import { ApiRequestError, getProduct, upsertCartItem } from "../api";
import { useAuth } from "../auth";
import { categoryPath, formatCategoryLabel } from "../catalog";
import { formatCents } from "../money";
import { RatingRow } from "../ProductCard";

export function ProductPage() {
  const { productId = "" } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getProduct(productId)
      .then((item) => {
        if (!cancelled) {
          setProduct(item);
        }
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(
            caught instanceof ApiRequestError && caught.status === 404
              ? "Product not found"
              : caught instanceof Error
                ? caught.message
                : "Could not load product",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  async function addToCart() {
    if (!user) {
      navigate("/login", { state: { from: { pathname: `/products/${productId}` } } });
      return;
    }
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      await upsertCartItem(productId, quantity);
      setStatus("Added to cart");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add to cart");
    } finally {
      setBusy(false);
    }
  }

  if (error && !product) {
    return <p className="flash error">{error}</p>;
  }
  if (!product) {
    return <p className="muted">Loading product…</p>;
  }

  return (
    <article className="detail">
      <img src={product.imageUrl} alt="" />
      <div>
        <p className="crumb">
          <Link to="/">Home</Link>
          <span aria-hidden="true"> / </span>
          <Link to={categoryPath(product.category)}>{formatCategoryLabel(product.category)}</Link>
        </p>
        <p className="eyebrow">{formatCategoryLabel(product.category)}</p>
        <h1>{product.name}</h1>
        <RatingRow product={product} />
        <p className="lede">{product.description}</p>
        <p className="price">{formatCents(product.unitPriceCents)}</p>
        <p className="muted">{product.stockQty} in stock</p>
        {error && <p className="flash error">{error}</p>}
        {status && <p className="flash ok">{status}</p>}
        <div className="row">
          <label>
            Qty
            <input
              type="number"
              min={1}
              max={product.stockQty || undefined}
              value={quantity}
              onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))}
            />
          </label>
          <button type="button" disabled={busy || product.stockQty < 1} onClick={() => void addToCart()}>
            {user ? "Add to cart" : "Sign in to add"}
          </button>
        </div>
        <p>
          <Link to="/cart">Go to cart</Link>
        </p>
      </div>
    </article>
  );
}
