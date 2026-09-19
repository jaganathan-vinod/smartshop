# Phase 3 — Orders

**Goal:** Explicit confirmation creates a snapshotted order with a human number, decrements stock, and exposes history only to the owner.

---

## US-3.01 Explicit confirmation required

**Title:** Order create fails without confirm  
**Actor:** Customer  
**Story:** As a customer, I want placing an order to fail unless I explicitly confirm.

**Preconditions**

- Cart is non-empty.
- Valid JWT.

**Main flow**

1. Client `POST /v1/orders` without `confirm: true` (missing, false, or string).
2. API rejects with 400.
3. Client `POST /v1/orders` with `{ deliveryMethod, confirm: true }`.
4. Order is created.

**Acceptance criteria**

- `confirm` must be boolean `true`; `"true"` fails Zod.
- On rejection, cart and stock are unchanged.
- On success, status is `CONFIRMED`.

**APIs / screens**

- `POST /v1/orders`
- Later SPA: `/checkout` Place order control

**Out of scope**

- Two-factor confirmation, email click-to-confirm.

---

## US-3.02 Order number and price snapshot

**Title:** Customer receives an order number and frozen prices  
**Actor:** Customer  
**Story:** As a customer, I want an order number after confirm and a snapshot of prices.

**Preconditions**

- Confirm path from US-3.01.

**Main flow**

1. Orders module re-prices with the same engine as quotes.
2. Allocates `orderNumber` via atomic counter: `SS-YYYYMMDD-#####`.
3. Writes order with item snapshots and full breakdown.
4. Clears the cart.
5. Returns `orderId`, `orderNumber`, `breakdown`, `items`, `status`.

**Acceptance criteria**

- Order numbers are unique.
- Changing product price after confirm does not change the stored order.
- Cart `Query` after success returns no lines.
- `isPremiumAtPurchase` is stored on the order.

**APIs / screens**

- `POST /v1/orders`
- Later SPA: confirmation view with order number

**Out of scope**

- Invoices, PDFs.

---

## US-3.03 Stock check and decrement

**Title:** Confirm cannot oversell  
**Actor:** Customer  
**Story:** As a customer, I want stock to be checked and decremented so I cannot buy more than available.

**Preconditions**

- Product `stockQty` is known.
- Cart quantity may exceed stock (race or stale UI).

**Main flow**

1. Confirm reads each product’s `stockQty`.
2. Conditional write decrements only if `stockQty >= quantity`.
3. If any line fails, the whole confirm fails; no order; cart unchanged; successful decrements are rolled back or avoided via transaction.

**Acceptance criteria**

- Oversell returns 409 `INSUFFICIENT_STOCK` with `productId`.
- Two concurrent confirms for the last unit: exactly one order succeeds.
- Successful order reduces `stockQty` by purchased qty.

**APIs / screens**

- `POST /v1/orders`

**Out of scope**

- Backorders, waitlists.

---

## US-3.04 Retrieve own previous orders

**Title:** Customer lists and opens own orders  
**Actor:** Customer  
**Story:** As a customer, I want to list and open my previous orders only.

**Preconditions**

- At least one confirmed order for the caller.

**Main flow**

1. `GET /v1/orders` returns newest first for the JWT `sub`.
2. `GET /v1/orders/{orderId}` returns one order if it belongs to the caller.
3. Another customer’s `orderId` returns 404 (not 403) to avoid leaking existence.

**Acceptance criteria**

- List never includes other users’ orders.
- Detail includes breakdown and snapshotted items.
- Unauthenticated → 401.

**APIs / screens**

- `GET /v1/orders`
- `GET /v1/orders/{orderId}`
- Later SPA: `/orders`, `/orders/:id`

**Out of scope**

- Admin order search, cancel/refund.

---

## US-3.05 Idempotent confirm

**Title:** Duplicate submit does not create two orders  
**Actor:** Customer  
**Story:** As a customer, I want a duplicate submit not to create two orders.

**Preconditions**

- Client sends `Idempotency-Key` header (UUID) on `POST /v1/orders`.

**Main flow**

1. First request with key K succeeds and creates order N.
2. Immediate retry with key K returns the same order N (200) without a second decrement.
3. Same key with a different body → 409 `IDEMPOTENCY_CONFLICT`.

**Acceptance criteria**

- Two orders are not created for one key.
- Chat (Phase 5) may use `conversationId` + turn as the key.

**APIs / screens**

- `POST /v1/orders`

**Out of scope**

- Exactly-once across 24h+ unless a TTL is added; v1 stores keys at least 24 hours.
