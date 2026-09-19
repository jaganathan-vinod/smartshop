import { Link } from "react-router-dom";
import type { Product } from "@smartshop/shared";
import { formatCategoryLabel } from "./catalog";
import { formatCents } from "./money";

type ProductCardProps = {
  product: Product;
  compact?: boolean;
};

export function ProductCard({ product, compact = false }: ProductCardProps) {
  return (
    <Link
      className={compact ? "card card-compact" : "card"}
      to={`/products/${product.productId}`}
    >
      <img src={product.imageUrl} alt="" />
      <h2>{product.name}</h2>
      <p className="price">{formatCents(product.unitPriceCents)}</p>
      {compact ? null : <p className="muted">{formatCategoryLabel(product.category)}</p>}
    </Link>
  );
}
