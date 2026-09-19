# Phase 2 — Cart and pricing

**Goal:** Server-side cart shared with chat, plus a quote that shows the full breakdown including premium discount and delivery.

**Related:** [project-business-requirements.md](../project-business-requirements.md) §6

---

## US-2.01 Add, update, and remove cart lines

**Title:** Customer maintains cart lines  
**Actor:** Customer  
**Story:** As a customer, I want to add, update, and remove cart lines so my basket is accurate.

**Preconditions**

- Valid customer JWT.
- Product exists, is `active`, and `stockQty` is used only as a hint until confirm (Phase 3 enforces stock).

**Main flow**

1. `PUT /v1/cart/items` with `{ productId, quantity }` upserts the line (`quantity >= 1`).
2. `PATCH /v1/cart/items/{productId}` changes quantity.
3. `DELETE /v1/cart/items/{productId}` or quantity `0` removes the line.
4. `GET /v1/cart` returns lines with live `unitPriceCents` from Products.

**Acceptance criteria**

- Unknown product → 404.
- Quantity `< 1` on PUT/PATCH → 400 unless treated as delete (document one behaviour: v1 PATCH/PUT reject `< 1`; DELETE removes).
- Unauthenticated → 401.
- Response never includes another user’s lines.

**APIs / screens**

- `GET /v1/cart`
- `PUT /v1/cart/items`
- `PATCH /v1/cart/items/{productId}`
- `DELETE /v1/cart/items/{productId}`
- Later SPA: `/cart`

**Out of scope**

- Saved-for-later, coupons.

---

## US-2.02 Server-side cart shared with chat

**Title:** One cart per user across clients  
**Actor:** Customer  
**Story:** As a customer, I want my cart persisted server-side so web and chat share it.

**Preconditions**

- Customer has added a line via HTTP.

**Main flow**

1. Customer adds a line on the web.
2. Same JWT loads `GET /v1/cart` from another client (or chat `get_cart` tool in Phase 5).
3. Lines match.

**Acceptance criteria**

- Cart items are DynamoDB rows keyed by `userId`.
- Refreshing the SPA does not empty the cart.
- Chat (Phase 5) mutates the same table.

**APIs / screens**

- Cart endpoints above; assistant tools in Phase 5.

**Out of scope**

- Guest / localStorage cart.

---

## US-2.03 Quote with standard or express delivery

**Title:** Customer previews the full price breakdown  
**Actor:** Customer  
**Story:** As a customer, I want a quote with STANDARD or EXPRESS so I can preview the full breakdown before ordering.

**Preconditions**

- Cart has at least one line.
- Customer JWT.

**Main flow**

1. Customer `POST /v1/quotes` with `{ "deliveryMethod": "STANDARD" | "EXPRESS" }`.
2. Pricing module computes subtotal, discount, delivery, tax, total (all cents).
3. Response includes line items (name, qty, unit price) and breakdown fields.
4. No order row is written.

**Acceptance criteria**

- STANDARD delivery cents = 499; EXPRESS = 1299.
- `taxCents` is 0.
- Empty cart → 400 `CART_EMPTY`.
- Invalid delivery method → 400.
- Quote is not persisted as a durable offer.

**APIs / screens**

- `POST /v1/quotes`
- Later SPA: `/checkout`

**Out of scope**

- Address capture, delivery slot booking.

---

## US-2.04 Premium 10% off merchandise

**Title:** Premium discount on quote  
**Actor:** Premium customer  
**Story:** As a premium customer, I want 10% off merchandise (not delivery) on that quote.

**Preconditions**

- `Users.isPremium === true`.
- Cart subtotal > 0.

**Main flow**

1. Premium customer requests a quote.
2. `premiumDiscountCents = floor(subtotalCents * 0.10)`.
3. Delivery cents are added in full.

**Acceptance criteria**

- Non-premium: `premiumDiscountCents === 0`.
- Premium: discount is 10% of subtotal, floored to cents, never applied to delivery.
- Example: subtotal 10000, STANDARD → discount 1000, delivery 499, total 9499.

**APIs / screens**

- `POST /v1/quotes`
- Unit tests in the `pricing` module

**Out of scope**

- Stackable coupons, percent-off delivery.
