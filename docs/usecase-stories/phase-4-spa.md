# Phase 4 — Web SPA

**Goal:** React + Vite UI on CloudFront so a customer can complete the full shopping journey in the browser.

**Related:** [project-technical-requirements.md](../project-technical-requirements.md) §6

---

## US-4.01 Google sign-in

**Title:** Customer signs in with Google in the React app  
**Actor:** Customer  
**Story:** As a customer, I want Google sign-in in the React app so my cart and orders are tied to me.

**Preconditions**

- Cognito User Pool with Google IdP (Phase 0).
- SPA hosted locally or on CloudFront.

**Main flow**

1. Customer opens `/login`.
2. Customer completes Google / Cognito hosted UI (or Amplify Authenticator).
3. SPA stores tokens securely (in-memory + refresh via Cognito; avoid long-lived tokens in localStorage if Amplify handles it).
4. Authenticated requests send `Authorization: Bearer`.
5. SPA calls `GET /v1/me` and shows display name.

**Acceptance criteria**

- Unsigned users can still open `/` catalogue.
- Cart, checkout, orders, and chat routes redirect to `/login`.
- Sign-out clears session and blocks those routes.

**APIs / screens**

- `/login`
- `GET /v1/me`

**Out of scope**

- Apple/Facebook IdPs, magic links.

---

## US-4.02 End-to-end web checkout

**Title:** Browse, cart, preview, confirm, order number  
**Actor:** Customer  
**Story:** As a customer, I want to complete browse → cart → checkout preview → confirm → order number in the browser.

**Preconditions**

- Signed in.
- Catalogue has stocked products.

**Main flow**

1. `/` lists products; search box calls `GET /v1/products?q=`.
2. `/products/:id` shows price and stock; Add to cart calls `PUT /v1/cart/items`.
3. `/cart` allows quantity change and remove.
4. `/checkout` lets the customer choose STANDARD or EXPRESS, calls `POST /v1/quotes`, and renders subtotal, premium discount (or “not applied”), delivery, tax, total.
5. Place order stays disabled until the customer checks an explicit confirm control.
6. Submit calls `POST /v1/orders` with `confirm: true` and `Idempotency-Key`.
7. Confirmation view shows `orderNumber`.

**Acceptance criteria**

- Breakdown numbers match the quote API (cents formatted as currency).
- Premium users see 10% off merchandise; non-premium see discount 0 / “not applied”.
- Double-click Place order does not create two orders.
- Empty cart cannot reach a successful order.

**APIs / screens**

- `/`, `/products/:id`, `/cart`, `/checkout`
- Catalogue, cart, quote, order APIs

**Out of scope**

- Guest checkout, saved addresses.

---

## US-4.03 Order history in the UI

**Title:** Orders list and detail pages  
**Actor:** Customer  
**Story:** As a customer, I want an orders list and order detail page so I can retrieve previous purchases.

**Preconditions**

- At least one confirmed order.

**Main flow**

1. `/orders` calls `GET /v1/orders` and lists order number, date, total.
2. `/orders/:id` calls `GET /v1/orders/{orderId}` and shows snapshotted lines and breakdown.

**Acceptance criteria**

- Newest orders first.
- Navigating from confirmation to history shows the new order.
- Unknown or other-user id shows a not-found state (no other customer’s data).

**APIs / screens**

- `/orders`, `/orders/:id`
- `GET /v1/orders`, `GET /v1/orders/{orderId}`

**Out of scope**

- Re-order button, returns.
