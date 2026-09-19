import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Order } from "@smartshop/shared";
import { listOrders } from "../api";
import { formatCents } from "../money";

export function OrdersPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listOrders()
      .then((result) => setOrders(result.orders))
      .catch((caught: unknown) => {
        setError(caught instanceof Error ? caught.message : "Could not load orders");
      });
  }, []);

  return (
    <section>
      <h1>Orders</h1>
      {error && <p className="flash error">{error}</p>}
      {orders === null && !error ? <p className="muted">Loading orders…</p> : null}
      {orders && orders.length === 0 ? (
        <p className="muted">No orders yet.</p>
      ) : null}
      {orders && orders.length > 0 ? (
        <ul className="lines">
          {orders.map((order) => (
            <li key={order.orderId}>
              <div>
                <Link to={`/orders/${order.orderId}`}>{order.orderNumber}</Link>
                <p className="muted">
                  {new Date(order.createdAt).toLocaleString()} · {order.status}
                </p>
              </div>
              <strong>{formatCents(order.breakdown.totalCents)}</strong>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
