# SmartShop — Project Business Requirements

**Product:** SmartShop  
**Version:** v1 (MVP)  
**Status:** Approved for documentation; application not built yet  
**Repo:** `/Users/dhivya/vinod/cursor-projects/smartshop`

## 1. Purpose

SmartShop lets socially authenticated customers shop a product catalogue, manage a cart, choose delivery, preview a complete price breakdown (including a 10% premium discount when eligible), place an order only after explicit confirmation, receive an order number, retrieve past orders, and complete the same journey through an AI chat assistant.

## 2. Goals

- Demonstrate a complete, trustworthy checkout path on the web and in chat.
- Use one pricing engine so web and chat never disagree on money.
- Keep v1 small: simulated checkout, seeded catalogue plus admin APIs, no merchant UI.

## 3. Success criteria

A Google-signed-in customer can complete:

**Browse → cart → delivery choice → price preview → explicit confirm → order number → order history**

on the web **and** in chat. Premium customers see 10% off merchandise (not delivery) in the preview and on the confirmed order.

## 4. Actors

| Actor | Description |
| --- | --- |
| **Visitor** | Unauthenticated person. May browse and search the catalogue. Cannot mutate a cart or place an order. |
| **Customer** | Google-authenticated shopper. May have `isPremium`. Owns a server-side cart and order history. |
| **Admin** | Cognito group `admin`. Creates/updates products and toggles premium flags via API (Postman/curl in v1). No admin UI. |
| **Assistant** | Amazon Bedrock tool loop acting **as the signed-in customer**. Cannot bypass confirmation, invent prices, or call admin APIs. |

## 5. Customer capabilities

1. Browse and search the product catalogue (name and category; case-insensitive contains on a small seeded set).
2. Add, update, and remove products from the shopping cart.
3. Select **standard** or **express** delivery.
4. Receive a **10% discount** if they are a premium customer.
5. Preview the **complete price breakdown** before placing an order.
6. Place an order only after **explicit confirmation**.
7. Receive an **order number**.
8. Retrieve **previous orders**.
9. Perform the same shopping journey through an **AI chat assistant**.

## 6. Pricing rules

All money in the product is stored and transported as integer **cents** in USD.

```
subtotalCents        = sum(unitPriceCents × quantity)
premiumDiscountCents = isPremium ? floor(subtotalCents × 0.10) : 0
deliveryCents        = STANDARD 499 | EXPRESS 1299
taxCents             = 0
totalCents           = subtotalCents − premiumDiscountCents + deliveryCents + taxCents
```

| Rule | Detail |
| --- | --- |
| Premium discount | 10% of merchandise subtotal only. Delivery is never discounted. |
| Tax | v1 always returns `taxCents: 0` so the breakdown shape is stable. |
| Standard delivery | $4.99, 3–5 days (`STANDARD`). |
| Express delivery | $12.99, 1–2 days (`EXPRESS`). |
| Quotes | Not stored as durable offers. Checkout **re-prices** at confirm time. |
| Snapshots | Item names, quantities, unit prices, and the full breakdown are copied onto the order. Later catalogue edits do not rewrite history. |

## 7. Checkout and confirmation

- Checkout is **simulated**. No card capture, Stripe, or real money movement.
- Placing an order persists a `CONFIRMED` order and returns a human order number, for example `SS-20260919-00041`.
- The API accepts create-order only when `confirm` is exactly `true`.
- Chat may call confirm only after it has shown the quote **and** the customer has replied with a clear yes (for example “yes, place it”).
- A duplicate submit with the same idempotency key must not create two orders.

## 8. Premium membership

- Not a paid subscription in v1.
- Stored as a boolean user flag (`isPremium`) for demo and test accounts.
- Admins toggle it via `PATCH /v1/admin/users/{userId}/premium`.
- Applied automatically on quote and confirm; the customer does not enter a coupon code.

## 9. Catalogue operations

- v1 starts from a **seeded** catalogue (~12 products).
- Admins may create and update products through **admin APIs**.
- There is **no admin UI** in v1.

## 10. Cart and stock

- One **server-side** cart per customer. It survives refresh and is shared with chat.
- Line quantity must be ≥ 1. Quantity 0 removes the line.
- Products have `stockQty`. Confirm checks availability and decrements with a conditional write. Insufficient stock fails the order; the cart is left unchanged.

## 11. Authentication and access

- Social login: **Google** via Amazon Cognito.
- Catalogue `GET` may be public.
- Cart, quotes, orders, chat, and `/me` require a signed-in customer.
- Admin routes require Cognito group `admin`. Google users are customers unless added to that group.
- Customer A cannot read Customer B’s cart or orders.

## 12. Out of scope for v1

- Real payments and refunds
- Admin / merchant UI
- Email or SMS notifications
- Returns, reviews, wishlists
- Guest checkout
- Multi-currency
- Dedicated search engine (OpenSearch)
- Native mobile apps
- Paid premium subscription

## 13. Related documents

- [project-technical-requirements.md](project-technical-requirements.md)
- [usecase-stories/](usecase-stories/)
- [github-setup.md](github-setup.md)
