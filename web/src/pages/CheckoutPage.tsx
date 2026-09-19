import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DELIVERY_CENTS, type DeliveryMethod, type QuoteResponse } from "@smartshop/shared";
import { ApiRequestError, createOrder, createQuote, getCart } from "../api";
import { formatCents } from "../money";

export function CheckoutPage() {
  const navigate = useNavigate();
  const idempotencyKey = useRef(crypto.randomUUID());
  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("STANDARD");
  const [quote, setQuote] = useState<QuoteResponse | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    getCart()
      .then((cart) => {
        if (cancelled) {
          return;
        }
        if (cart.items.length === 0) {
          setEmpty(true);
          setQuote(null);
          return;
        }
        setEmpty(false);
        return createQuote(deliveryMethod).then((next) => {
          if (!cancelled) {
            setQuote(next);
          }
        });
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "Could not load checkout");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [deliveryMethod]);

  async function placeOrder() {
    if (!confirmed || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const order = await createOrder(deliveryMethod, idempotencyKey.current);
      navigate(`/orders/${order.orderId}`, { state: { placed: true } });
    } catch (caught) {
      if (caught instanceof ApiRequestError && caught.code === "CART_EMPTY") {
        setEmpty(true);
        setQuote(null);
      }
      setError(caught instanceof Error ? caught.message : "Could not place order");
      setBusy(false);
    }
  }

  if (empty) {
    return (
      <section>
        <h1>Checkout</h1>
        <p className="muted">
          Your cart is empty, so there is nothing to confirm.{" "}
          <Link to="/">Continue shopping</Link>.
        </p>
      </section>
    );
  }

  return (
    <section className="checkout">
      <h1>Checkout</h1>
      {error && <p className="flash error">{error}</p>}
      {!quote && !error ? <p className="muted">Loading quote…</p> : null}
      {quote ? (
        <>
          <ul className="lines">
            {quote.items.map((item) => (
              <li key={item.productId}>
                <span>
                  {item.name} × {item.quantity}
                </span>
                <span>{formatCents(item.unitPriceCents * item.quantity)}</span>
              </li>
            ))}
          </ul>
          <fieldset>
            <legend>Delivery</legend>
            <label>
              <input
                type="radio"
                name="delivery"
                checked={deliveryMethod === "STANDARD"}
                onChange={() => setDeliveryMethod("STANDARD")}
              />
              Standard ({formatCents(DELIVERY_CENTS.STANDARD)})
            </label>
            <label>
              <input
                type="radio"
                name="delivery"
                checked={deliveryMethod === "EXPRESS"}
                onChange={() => setDeliveryMethod("EXPRESS")}
              />
              Express ({formatCents(DELIVERY_CENTS.EXPRESS)})
            </label>
          </fieldset>
          <dl className="totals">
            <div>
              <dt>Subtotal</dt>
              <dd>{formatCents(quote.breakdown.subtotalCents)}</dd>
            </div>
            <div>
              <dt>Premium discount</dt>
              <dd>
                {quote.breakdown.premiumDiscountCents > 0
                  ? `−${formatCents(quote.breakdown.premiumDiscountCents)}`
                  : "not applied"}
              </dd>
            </div>
            <div>
              <dt>Delivery</dt>
              <dd>{formatCents(quote.breakdown.deliveryCents)}</dd>
            </div>
            <div>
              <dt>Tax</dt>
              <dd>{formatCents(quote.breakdown.taxCents)}</dd>
            </div>
            <div className="grand">
              <dt>Total</dt>
              <dd>{formatCents(quote.breakdown.totalCents)}</dd>
            </div>
          </dl>
          <label className="confirm">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I confirm this order and understand checkout is simulated.
          </label>
          <button type="button" disabled={!confirmed || busy} onClick={() => void placeOrder()}>
            Place order
          </button>
        </>
      ) : null}
    </section>
  );
}
