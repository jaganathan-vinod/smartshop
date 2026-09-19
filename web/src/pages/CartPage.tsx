import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { CartLine } from "@smartshop/shared";
import { deleteCartItem, getCart, patchCartItem } from "../api";
import { formatCents } from "../money";

export function CartPage() {
  const [items, setItems] = useState<CartLine[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    const result = await getCart();
    setItems(result.items);
  }

  useEffect(() => {
    reload().catch((caught: unknown) => {
      setError(caught instanceof Error ? caught.message : "Could not load cart");
    });
  }, []);

  async function updateQuantity(productId: string, quantity: number) {
    setBusyId(productId);
    setError(null);
    try {
      const result = await patchCartItem(productId, Math.max(1, quantity));
      setItems(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update cart");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(productId: string) {
    setBusyId(productId);
    setError(null);
    try {
      const result = await deleteCartItem(productId);
      setItems(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove item");
    } finally {
      setBusyId(null);
    }
  }

  if (items === null && !error) {
    return <p className="muted">Loading cart…</p>;
  }

  const subtotal =
    items?.reduce((sum, item) => sum + item.unitPriceCents * item.quantity, 0) ?? 0;

  return (
    <section>
      <h1>Cart</h1>
      {error && <p className="flash error">{error}</p>}
      {items && items.length === 0 ? (
        <p className="muted">
          Your cart is empty. <Link to="/">Browse the catalogue</Link>.
        </p>
      ) : null}
      {items && items.length > 0 ? (
        <>
          <ul className="lines">
            {items.map((item) => (
              <li key={item.productId}>
                <div>
                  <Link to={`/products/${item.productId}`}>{item.name}</Link>
                  <p className="muted">{formatCents(item.unitPriceCents)} each</p>
                </div>
                <div className="row">
                  <input
                    type="number"
                    min={1}
                    value={item.quantity}
                    disabled={busyId === item.productId}
                    onChange={(event) =>
                      void updateQuantity(item.productId, Number(event.target.value) || 1)
                    }
                    aria-label={`Quantity for ${item.name}`}
                  />
                  <button
                    type="button"
                    className="linkish"
                    disabled={busyId === item.productId}
                    onClick={() => void remove(item.productId)}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <p className="price">Merchandise {formatCents(subtotal)}</p>
          <p>
            <Link className="cta" to="/checkout">
              Checkout
            </Link>
          </p>
        </>
      ) : null}
    </section>
  );
}
