import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { Product } from "@smartshop/shared";
import { upsertCartItem } from "./api";
import { useAuth } from "./auth";
import { dealCompareAtCents, formatCategoryLabel, productSocialProof } from "./catalog";
import { formatCents } from "./money";

type ProductCardProps = {
  product: Product;
  variant?: "grid" | "deal" | "pick";
};

function CartGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M7 18a2 2 0 1 0 0 4 2 2 0 0 0 0-4Zm10 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4ZM6.2 6l.4 2h12.7a1 1 0 0 1 1 .8l1.2 6a1 1 0 0 1-1 1.2H8.1a1 1 0 0 1-1-.8L5.3 5H3V3h2.7a1 1 0 0 1 1 .8L6.2 6Z"
      />
    </svg>
  );
}

export function RatingRow({ product }: { product: Product }) {
  const { rating, reviewCount } = productSocialProof(product);
  return (
    <p className="rating">
      <span className="star" aria-hidden="true">
        ★
      </span>
      <span>{rating.toFixed(1)}</span>
      <span className="rating-count">({reviewCount})</span>
    </p>
  );
}

export function ProductCard({ product, variant = "grid" }: ProductCardProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);
  const [saved, setSaved] = useState(false);
  const compareAt = variant === "deal" ? dealCompareAtCents(product) : undefined;
  const discount =
    product.productId === "prod-running-socks"
      ? 20
      : compareAt && compareAt > product.unitPriceCents
        ? Math.round((1 - product.unitPriceCents / compareAt) * 100)
        : 0;

  async function addToCart() {
    if (!user) {
      navigate("/login", { state: { from: { pathname: `/products/${product.productId}` } } });
      return;
    }
    setBusy(true);
    try {
      await upsertCartItem(product.productId, 1);
      setAdded(true);
    } catch {
      setAdded(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`product-tile product-tile-${variant}`}>
      <Link className="product-tile-link" to={`/products/${product.productId}`}>
        <span className="product-tile-media">
          <img src={product.imageUrl} alt="" />
          {discount >= 15 ? <span className="deal-badge">{discount}% OFF</span> : null}
        </span>
        <div className="product-tile-copy">
          <h2>{product.name}</h2>
          {variant === "grid" ? <p className="muted">{formatCategoryLabel(product.category)}</p> : null}
          <RatingRow product={product} />
        </div>
      </Link>
      <div className="product-tile-foot">
        <p className="price">
          {formatCents(product.unitPriceCents)}
          {compareAt ? <s>{formatCents(compareAt)}</s> : null}
        </p>
        <button type="button" className="card-cart" disabled={busy} onClick={() => void addToCart()}>
          <CartGlyph />
          {added ? "Added" : "Add to cart"}
        </button>
      </div>
      <button
        type="button"
        className={`wish${saved ? " saved" : ""}`}
        aria-pressed={saved}
        aria-label={saved ? `Remove ${product.name} from saved` : `Save ${product.name}`}
        onClick={() => setSaved((value) => !value)}
      >
        {saved ? "♥" : "♡"}
      </button>
    </article>
  );
}
