import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import type { Order } from "@smartshop/shared";
import { ApiRequestError, getOrder } from "../api";
import { formatCents } from "../money";

export function OrderDetailPage() {
  const { orderId = "" } = useParams();
  const placed = Boolean((useLocation().state as { placed?: boolean } | null)?.placed);
  const [order, setOrder] = useState<Order | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getOrder(orderId)
      .then(setOrder)
      .catch((caught: unknown) => {
        setError(
          caught instanceof ApiRequestError && caught.status === 404
            ? "Order not found"
            : caught instanceof Error
              ? caught.message
              : "Could not load order",
        );
      });
  }, [orderId]);

  if (error) {
    return (
      <section>
        <h1>Order</h1>
        <p className="flash error">{error}</p>
        <p>
          <Link to="/orders">Back to orders</Link>
        </p>
      </section>
    );
  }
  if (!order) {
    return <p className="muted">Loading order…</p>;
  }

  return (
    <section>
      {placed ? (
        <p className="flash ok">Order confirmed. Your number is {order.orderNumber}.</p>
      ) : null}
      <p className="eyebrow">{order.status}</p>
      <h1>{order.orderNumber}</h1>
      <p className="muted">{new Date(order.createdAt).toLocaleString()}</p>
      <ul className="lines">
        {order.items.map((item) => (
          <li key={item.productId}>
            <span>
              {item.name} × {item.quantity}
            </span>
            <span>{formatCents(item.unitPriceCents * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <dl className="totals">
        <div>
          <dt>Subtotal</dt>
          <dd>{formatCents(order.breakdown.subtotalCents)}</dd>
        </div>
        <div>
          <dt>Premium discount</dt>
          <dd>
            {order.isPremiumAtPurchase && order.breakdown.premiumDiscountCents > 0
              ? `−${formatCents(order.breakdown.premiumDiscountCents)}`
              : "not applied"}
          </dd>
        </div>
        <div>
          <dt>Delivery ({order.deliveryMethod})</dt>
          <dd>{formatCents(order.breakdown.deliveryCents)}</dd>
        </div>
        <div>
          <dt>Tax</dt>
          <dd>{formatCents(order.breakdown.taxCents)}</dd>
        </div>
        <div className="grand">
          <dt>Total</dt>
          <dd>{formatCents(order.breakdown.totalCents)}</dd>
        </div>
      </dl>
      <p>
        <Link to="/orders">All orders</Link>
      </p>
    </section>
  );
}
