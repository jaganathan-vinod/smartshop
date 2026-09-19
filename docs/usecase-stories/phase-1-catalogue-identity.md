# Phase 1 — Catalogue and identity

**Goal:** Visitors can browse and search products. Signed-in customers get a profile. Admins can manage products and premium flags via API.

**Related:** [project-business-requirements.md](../project-business-requirements.md)

---

## US-1.01 List and search products

**Title:** Visitor browses and searches the catalogue  
**Actor:** Visitor  
**Story:** As a visitor, I want to list and search products so I can find something to buy.

**Preconditions**

- Seeded catalogue exists.
- `GET /v1/products` is unauthenticated.

**Main flow**

1. Client calls `GET /v1/products`.
2. Optional `q` filters `nameLower` with case-insensitive contains.
3. Optional `category` filters category.
4. Optional `limit` caps page size.
5. Inactive products are omitted.

**Acceptance criteria**

- Empty `q` returns active products.
- `q=mug` returns only names containing “mug” (any case).
- Unknown category returns an empty list, not an error.
- Response includes `productId`, `name`, `category`, `unitPriceCents`, `currency`, `stockQty`, `imageUrl`.

**APIs / screens**

- `GET /v1/products?q=&category=&limit=`
- Later SPA: `/`

**Out of scope**

- OpenSearch, faceted filters, pagination tokens (v1 may use `limit` only).

---

## US-1.02 Product detail

**Title:** Visitor opens a product by id  
**Actor:** Visitor  
**Story:** As a visitor, I want a product detail by id so I can see price and stock.

**Preconditions**

- Product exists and is active (or admin may still GET inactive — v1: 404 if missing).

**Main flow**

1. Client calls `GET /v1/products/{productId}`.
2. Lambda `GetItem` by `productId`.
3. Return full product payload including `description` and `stockQty`.

**Acceptance criteria**

- Known id returns 200 with `unitPriceCents` and `stockQty`.
- Unknown id returns 404 `{ error.code: "NOT_FOUND" }`.
- Invalid id format fails Zod with 400.

**APIs / screens**

- `GET /v1/products/{productId}`
- Later SPA: `/products/:id`

**Out of scope**

- Related products, reviews.

---

## US-1.03 Current user profile

**Title:** Customer identity upsert on `/me`  
**Actor:** Customer  
**Story:** As a signed-in customer, I want `GET /me` so the app knows my name and premium flag.

**Preconditions**

- Valid Cognito JWT from email/password sign-in.

**Main flow**

1. Customer calls `GET /v1/me` with `Authorization: Bearer`.
2. Identity module upserts `Users` on Cognito `sub` using email and name from claims.
3. Response includes `isPremium` (default `false` on first seen).

**Acceptance criteria**

- First call creates the user item; second call does not duplicate.
- Unauthenticated request returns 401.
- `isPremium` is false until an admin toggles it.
- `displayName` matches the Cognito `name` captured at sign-up.

**APIs / screens**

- `GET /v1/me`

**Out of scope**

- Profile edit UI, address book.

---

## US-1.04 Admin catalogue and premium flag

**Title:** Admin manages products and premium via API  
**Actor:** Admin  
**Story:** As an admin, I want to create/update products and toggle `isPremium` via API so the demo catalogue and discount can be controlled without an admin UI.

**Preconditions**

- Caller JWT includes Cognito group `admin`.

**Main flow**

1. Admin `POST /v1/admin/products` with name, price cents, stock, category.
2. Admin `PUT` or `PATCH` to change price, stock, or `active`.
3. Admin `PATCH /v1/admin/users/{userId}/premium` with `{ "isPremium": true }`.

**Acceptance criteria**

- Customer JWT on admin routes returns 403.
- Created product appears in public `GET /v1/products`.
- After premium toggle, `GET /v1/me` as that user returns `isPremium: true`.
- Zod rejects negative prices and negative stock.

**APIs / screens**

- `POST /v1/admin/products`
- `PUT /v1/admin/products/{productId}`
- `PATCH /v1/admin/products/{productId}`
- `PATCH /v1/admin/users/{userId}/premium`

**Out of scope**

- Admin UI, bulk CSV import, customer self-service premium.
